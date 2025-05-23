;; DAO Proposal Bounty System
;; A smart contract that manages DAO-approved bounty tasks with automated payouts

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-invalid-status (err u103))
(define-constant err-insufficient-funds (err u104))
(define-constant err-already-voted (err u105))
(define-constant err-voting-closed (err u106))
(define-constant err-task-not-open (err u107))
(define-constant err-not-assignee (err u108))
(define-constant err-invalid-amount (err u109))

;; Data Variables
(define-data-var next-proposal-id uint u1)
(define-data-var next-task-id uint u1)
(define-data-var dao-treasury uint u0)
(define-data-var voting-period uint u1008) ;; blocks (~1 week)
(define-data-var quorum-threshold uint u51) ;; 51% quorum
(define-data-var approval-threshold uint u60) ;; 60% approval needed

;; Data Maps
(define-map proposals
    uint
    {
        id: uint,
        proposer: principal,
        title: (string-ascii 100),
        description: (string-ascii 500),
        reward-amount: uint,
        status: (string-ascii 20),
        created-at: uint,
        voting-ends-at: uint,
        votes-for: uint,
        votes-against: uint,
        total-voters: uint
    }
)

(define-map tasks
    uint
    {
        id: uint,
        proposal-id: uint,
        title: (string-ascii 100),
        description: (string-ascii 500),
        reward-amount: uint,
        assignee: (optional principal),
        status: (string-ascii 20),
        created-at: uint,
        completed-at: (optional uint),
        deliverable-hash: (optional (buff 32))
    }
)

(define-map dao-members principal bool)
(define-map member-voting-power principal uint)
(define-map proposal-votes { proposal-id: uint, voter: principal } bool)
(define-map task-submissions { task-id: uint, submitter: principal } (buff 32))

;; Authorization Functions
(define-private (is-dao-member (user principal))
    (default-to false (map-get? dao-members user))
)

(define-private (get-voting-power (user principal))
    (default-to u0 (map-get? member-voting-power user))
)

(define-private (is-contract-owner)
    (is-eq tx-sender contract-owner)
)

;; DAO Member Management
(define-public (add-dao-member (member principal) (voting-power uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (map-set dao-members member true)
        (map-set member-voting-power member voting-power)
        (ok true)
    )
)

(define-public (remove-dao-member (member principal))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (map-delete dao-members member)
        (map-delete member-voting-power member)
        (ok true)
    )
)

;; Treasury Management
(define-public (fund-treasury (amount uint))
    (begin
        (asserts! (> amount u0) err-invalid-amount)
        (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
        (var-set dao-treasury (+ (var-get dao-treasury) amount))
        (ok amount)
    )
)

(define-read-only (get-treasury-balance)
    (var-get dao-treasury)
)

;; Proposal Functions
(define-public (create-proposal 
    (title (string-ascii 100))
    (description (string-ascii 500))
    (reward-amount uint))
    (let
        (
            (proposal-id (var-get next-proposal-id))
            (current-block stacks-block-height)
        )
        (asserts! (is-dao-member tx-sender) err-unauthorized)
        (asserts! (> reward-amount u0) err-invalid-amount)
        (asserts! (<= reward-amount (var-get dao-treasury)) err-insufficient-funds)
        
        (map-set proposals proposal-id {
            id: proposal-id,
            proposer: tx-sender,
            title: title,
            description: description,
            reward-amount: reward-amount,
            status: "pending",
            created-at: current-block,
            voting-ends-at: (+ current-block (var-get voting-period)),
            votes-for: u0,
            votes-against: u0,
            total-voters: u0
        })
        
        (var-set next-proposal-id (+ proposal-id u1))
        (ok proposal-id)
    )
)

(define-public (vote-on-proposal (proposal-id uint) (vote-for bool))
    (let
        (
            (proposal (unwrap! (map-get? proposals proposal-id) err-not-found))
            (voter-power (get-voting-power tx-sender))
            (has-voted (is-some (map-get? proposal-votes { proposal-id: proposal-id, voter: tx-sender })))
        )
        (asserts! (is-dao-member tx-sender) err-unauthorized)
        (asserts! (not has-voted) err-already-voted)
        (asserts! (<= stacks-block-height (get voting-ends-at proposal)) err-voting-closed)
        (asserts! (is-eq (get status proposal) "pending") err-invalid-status)
        
        (map-set proposal-votes { proposal-id: proposal-id, voter: tx-sender } vote-for)
        
        (map-set proposals proposal-id (merge proposal {
            votes-for: (if vote-for (+ (get votes-for proposal) voter-power) (get votes-for proposal)),
            votes-against: (if vote-for (get votes-against proposal) (+ (get votes-against proposal) voter-power)),
            total-voters: (+ (get total-voters proposal) voter-power)
        }))
        
        (ok true)
    )
)

(define-public (finalize-proposal (proposal-id uint))
    (let
        (
            (proposal (unwrap! (map-get? proposals proposal-id) err-not-found))
            (total-votes (get total-voters proposal))
            (votes-for (get votes-for proposal))
            (quorum-met (>= (* total-votes u100) (* (var-get quorum-threshold) u100)))
            (approval-met (>= (* votes-for u100) (* (var-get approval-threshold) total-votes)))
        )
        (asserts! (> stacks-block-height (get voting-ends-at proposal)) err-voting-closed)
        (asserts! (is-eq (get status proposal) "pending") err-invalid-status)
        
        (if (and quorum-met approval-met)
            (begin
                (map-set proposals proposal-id (merge proposal { status: "approved" }))
                (try! (create-task-from-proposal proposal-id))
                (ok "approved")
            )
            (begin
                (map-set proposals proposal-id (merge proposal { status: "rejected" }))
                (ok "rejected")
            )
        )
    )
)

;; Task Functions
(define-private (create-task-from-proposal (proposal-id uint))
    (let
        (
            (proposal (unwrap! (map-get? proposals proposal-id) err-not-found))
            (task-id (var-get next-task-id))
        )
        (map-set tasks task-id {
            id: task-id,
            proposal-id: proposal-id,
            title: (get title proposal),
            description: (get description proposal),
            reward-amount: (get reward-amount proposal),
            assignee: none,
            status: "open",
            created-at: stacks-block-height,
            completed-at: none,
            deliverable-hash: none
        })
        
        (var-set next-task-id (+ task-id u1))
        (ok task-id)
    )
)

(define-public (assign-task (task-id uint) (assignee principal))
    (let
        (
            (task (unwrap! (map-get? tasks task-id) err-not-found))
        )
        (asserts! (is-dao-member tx-sender) err-unauthorized)
        (asserts! (is-eq (get status task) "open") err-task-not-open)
        
        (map-set tasks task-id (merge task {
            assignee: (some assignee),
            status: "assigned"
        }))
        
        (ok true)
    )
)

(define-public (submit-deliverable (task-id uint) (deliverable-hash (buff 32)))
    (let
        (
            (task (unwrap! (map-get? tasks task-id) err-not-found))
            (assignee (unwrap! (get assignee task) err-not-assignee))
        )
        (asserts! (is-eq tx-sender assignee) err-not-assignee)
        (asserts! (is-eq (get status task) "assigned") err-invalid-status)
        
        (map-set task-submissions { task-id: task-id, submitter: tx-sender } deliverable-hash)
        
        (map-set tasks task-id (merge task {
            status: "submitted",
            deliverable-hash: (some deliverable-hash)
        }))
        
        (ok true)
    )
)

(define-public (approve-task-completion (task-id uint))
    (let
        (
            (task (unwrap! (map-get? tasks task-id) err-not-found))
            (assignee (unwrap! (get assignee task) err-not-assignee))
            (reward-amount (get reward-amount task))
        )
        (asserts! (is-dao-member tx-sender) err-unauthorized)
        (asserts! (is-eq (get status task) "submitted") err-invalid-status)
        (asserts! (>= (var-get dao-treasury) reward-amount) err-insufficient-funds)
        
        ;; Transfer reward to assignee
        (try! (as-contract (stx-transfer? reward-amount tx-sender assignee)))
        
        ;; Update treasury balance
        (var-set dao-treasury (- (var-get dao-treasury) reward-amount))
        
        ;; Update task status
        (map-set tasks task-id (merge task {
            status: "completed",
            completed-at: (some stacks-block-height)
        }))
        
        (ok reward-amount)
    )
)

;; Read-only Functions
(define-read-only (get-proposal (proposal-id uint))
    (map-get? proposals proposal-id)
)

(define-read-only (get-task (task-id uint))
    (map-get? tasks task-id)
)

(define-read-only (get-next-proposal-id)
    (var-get next-proposal-id)
)

(define-read-only (get-next-task-id)
    (var-get next-task-id)
)

(define-read-only (has-voted (proposal-id uint) (voter principal))
    (is-some (map-get? proposal-votes { proposal-id: proposal-id, voter: voter }))
)

(define-read-only (get-vote (proposal-id uint) (voter principal))
    (map-get? proposal-votes { proposal-id: proposal-id, voter: voter })
)

(define-read-only (is-member (user principal))
    (is-dao-member user)
)

(define-read-only (get-user-voting-power (user principal))
    (get-voting-power user)
)

;; Contract Settings
(define-public (set-voting-period (new-period uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (var-set voting-period new-period)
        (ok true)
    )
)

(define-public (set-quorum-threshold (new-threshold uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (<= new-threshold u100) err-invalid-amount)
        (var-set quorum-threshold new-threshold)
        (ok true)
    )
)

(define-public (set-approval-threshold (new-threshold uint))
    (begin
        (asserts! (is-contract-owner) err-owner-only)
        (asserts! (<= new-threshold u100) err-invalid-amount)
        (var-set approval-threshold new-threshold)
        (ok true)
    )
)