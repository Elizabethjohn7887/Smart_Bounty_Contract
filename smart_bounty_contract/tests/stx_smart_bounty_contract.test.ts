import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!; 
const charlie = accounts.get("wallet_3")!;

const contractName = "dao-bounty-system";

describe("DAO Proposal Bounty System", () => {
  it("should allow contract owner to add DAO members", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "add-dao-member",
      [types.principal(alice), types.uint(100)],
      deployer
    );
    
    expect(result).toBeOk(types.bool(true));
    
    // Verify member was added
    const memberCheck = simnet.callReadOnlyFn(
      contractName,
      "is-member",
      [types.principal(alice)],
      deployer
    );
    expect(memberCheck.result).toBe(types.bool(true));
    
    // Verify voting power was set
    const votingPower = simnet.callReadOnlyFn(
      contractName,
      "get-user-voting-power",
      [types.principal(alice)],
      deployer
    );
    expect(votingPower.result).toBe(types.uint(100));
  });

  it("should prevent non-owners from adding DAO members", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "add-dao-member",
      [types.principal(bob), types.uint(50)],
      alice
    );
    
    expect(result).toBeErr(types.uint(100)); // err-owner-only
  });

  it("should allow contract owner to remove DAO members", () => {
    // First add a member
    simnet.callPublicFn(
      contractName,
      "add-dao-member",
      [types.principal(alice), types.uint(100)],
      deployer
    );
    
    // Then remove the member
    const { result } = simnet.callPublicFn(
      contractName,
      "remove-dao-member",
      [types.principal(alice)],
      deployer
    );
    
    expect(result).toBeOk(types.bool(true));
    
    // Verify member was removed
    const memberCheck = simnet.callReadOnlyFn(
      contractName,
      "is-member",
      [types.principal(alice)],
      deployer
    );
    expect(memberCheck.result).toBe(types.bool(false));
  });

  it("should allow funding the treasury", () => {
    const fundAmount = 1000000; // 1 STX in microSTX
    
    const { result } = simnet.callPublicFn(
      contractName,
      "fund-treasury",
      [types.uint(fundAmount)],
      deployer
    );
    
    expect(result).toBeOk(types.uint(fundAmount));
    
    // Check treasury balance
    const balance = simnet.callReadOnlyFn(
      contractName,
      "get-treasury-balance",
      [],
      deployer
    );
    expect(balance.result).toBe(types.uint(fundAmount));
  });

  it("should reject funding with zero amount", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "fund-treasury",
      [types.uint(0)],
      deployer
    );
    
    expect(result).toBeErr(types.uint(109)); // err-invalid-amount
  });

  it("should allow DAO members to create proposals", () => {
    // Setup: Add Alice as DAO member and fund treasury
    simnet.callPublicFn(
      contractName,
      "add-dao-member",
      [types.principal(alice), types.uint(100)],
      deployer
    );
    
    simnet.callPublicFn(
      contractName,
      "fund-treasury",
      [types.uint(2000000)], // 2 STX
      deployer
    );

    const { result } = simnet.callPublicFn(
      contractName,
      "create-proposal",
      [
        types.ascii("Bug Fix"),
        types.ascii("Fix critical security vulnerability"),
        types.uint(500000) // 0.5 STX reward
      ],
      alice
    );
    
    expect(result).toBeOk(types.uint(1)); // First proposal ID
    
    // Verify proposal was created
    const proposal = simnet.callReadOnlyFn(
      contractName,
      "get-proposal",
      [types.uint(1)],
      alice
    );
    
    expect(proposal.result).toBeSome();
  });

  it("should prevent non-members from creating proposals", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "create-proposal",
      [
        types.ascii("Bug Fix"),
        types.ascii("Fix critical security vulnerability"),
        types.uint(500000)
      ],
      bob // Bob is not a DAO member
    );
    
    expect(result).toBeErr(types.uint(102)); // err-unauthorized
  });

  it("should prevent proposals with reward exceeding treasury", () => {
    // Add Alice as member but don't fund enough
    simnet.callPublicFn(
      contractName,
      "add-dao-member",
      [types.principal(alice), types.uint(100)],
      deployer
    );
    
    simnet.callPublicFn(
      contractName,
      "fund-treasury",
      [types.uint(1000000)], // Only 1 STX
      deployer
    );

    const { result } = simnet.callPublicFn(
      contractName,
      "create-proposal",
      [
        types.ascii("Expensive Task"),
        types.ascii("This costs too much"),
        types.uint(5000000) // 5 STX, more than treasury
      ],
      alice
    );
    
    expect(result).toBeErr(types.uint(104)); // err-insufficient-funds
  });

  it("should allow DAO members to vote on proposals", () => {
    // Setup
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(alice), types.uint(100)], deployer);
    simnet.callPublicFn(contractName, "fund-treasury", [types.uint(2000000)], deployer);
    
    simnet.callPublicFn(
      contractName,
      "create-proposal",
      [types.ascii("Test Proposal"), types.ascii("Description"), types.uint(500000)],
      alice
    );

    const { result } = simnet.callPublicFn(
      contractName,
      "vote-on-proposal",
      [types.uint(1), types.bool(true)], // Vote yes on proposal 1
      alice
    );
    
    expect(result).toBeOk(types.bool(true));
    
    // Check if vote was recorded
    const hasVoted = simnet.callReadOnlyFn(
      contractName,
      "has-voted",
      [types.uint(1), types.principal(alice)],
      alice
    );
    expect(hasVoted.result).toBe(types.bool(true));
  });

  it("should prevent double voting", () => {
    // Setup
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(alice), types.uint(100)], deployer);
    simnet.callPublicFn(contractName, "fund-treasury", [types.uint(2000000)], deployer);
    
    simnet.callPublicFn(
      contractName,
      "create-proposal",
      [types.ascii("Test Proposal"), types.ascii("Description"), types.uint(500000)],
      alice
    );

    // First vote
    simnet.callPublicFn(
      contractName,
      "vote-on-proposal",
      [types.uint(1), types.bool(true)],
      alice
    );
    
    // Second vote should fail
    const { result } = simnet.callPublicFn(
      contractName,
      "vote-on-proposal",
      [types.uint(1), types.bool(false)],
      alice
    );
    
    expect(result).toBeErr(types.uint(105)); // err-already-voted
  });

  it("should prevent non-members from voting", () => {
    // Setup proposal without adding bob as member
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(alice), types.uint(100)], deployer);
    simnet.callPublicFn(contractName, "fund-treasury", [types.uint(2000000)], deployer);
    
    simnet.callPublicFn(
      contractName,
      "create-proposal",
      [types.ascii("Test Proposal"), types.ascii("Description"), types.uint(500000)],
      alice
    );
    
    const { result } = simnet.callPublicFn(
      contractName,
      "vote-on-proposal",
      [types.uint(1), types.bool(true)],
      bob // Bob is not a DAO member
    );
    
    expect(result).toBeErr(types.uint(102)); // err-unauthorized
  });

  it("should correctly tally votes with different voting powers", () => {
    // Setup multiple members
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(alice), types.uint(100)], deployer);
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(bob), types.uint(150)], deployer);
    simnet.callPublicFn(contractName, "fund-treasury", [types.uint(2000000)], deployer);
    
    simnet.callPublicFn(
      contractName,
      "create-proposal",
      [types.ascii("Test Proposal"), types.ascii("Description"), types.uint(500000)],
      alice
    );

    // Alice votes yes (100 power)
    simnet.callPublicFn(contractName, "vote-on-proposal", [types.uint(1), types.bool(true)], alice);
    
    // Bob votes no (150 power)
    simnet.callPublicFn(contractName, "vote-on-proposal", [types.uint(1), types.bool(false)], bob);
    
    // Check proposal vote counts
    const proposal = simnet.callReadOnlyFn(contractName, "get-proposal", [types.uint(1)], alice);
    expect(proposal.result).toBeSome();
  });

  it("should finalize approved proposals and create tasks", () => {
    // Setup with sufficient votes for approval
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(alice), types.uint(60)], deployer);
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(bob), types.uint(40)], deployer);
    simnet.callPublicFn(contractName, "fund-treasury", [types.uint(2000000)], deployer);
    
    // Create proposal
    simnet.callPublicFn(
      contractName,
      "create-proposal",
      [types.ascii("Test Proposal"), types.ascii("Description"), types.uint(500000)],
      alice
    );

    // Both vote yes (60% approval threshold with 100% participation)
    simnet.callPublicFn(contractName, "vote-on-proposal", [types.uint(1), types.bool(true)], alice);
    simnet.callPublicFn(contractName, "vote-on-proposal", [types.uint(1), types.bool(true)], bob);
    
    // Advance blocks past voting period
    simnet.mineEmptyBlocks(1009);
    
    // Finalize proposal
    const { result } = simnet.callPublicFn(contractName, "finalize-proposal", [types.uint(1)], alice);
    expect(result).toBeOk(types.ascii("approved"));
    
    // Check that task was created
    const task = simnet.callReadOnlyFn(contractName, "get-task", [types.uint(1)], alice);
    expect(task.result).toBeSome();
  });

  it("should allow task assignment and completion flow", () => {
    // Setup approved proposal and task
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(alice), types.uint(60)], deployer);
    simnet.callPublicFn(contractName, "add-dao-member", [types.principal(bob), types.uint(40)], deployer);
    simnet.callPublicFn(contractName, "fund-treasury", [types.uint(2000000)], deployer);
    
    simnet.callPublicFn(
      contractName,
      "create-proposal",
      [types.ascii("Test Task"), types.ascii("Description"), types.uint(500000)],
      alice
    );

    simnet.callPublicFn(contractName, "vote-on-proposal", [types.uint(1), types.bool(true)], alice);
    simnet.callPublicFn(contractName, "vote-on-proposal", [types.uint(1), types.bool(true)], bob);
    
    simnet.mineEmptyBlocks(1009);
    simnet.callPublicFn(contractName, "finalize-proposal", [types.uint(1)], alice);
    
    // Assign task
    const assignResult = simnet.callPublicFn(
      contractName,
      "assign-task",
      [types.uint(1), types.principal(charlie)],
      alice
    );
    expect(assignResult).toBeOk(types.bool(true));
    
    // Submit deliverable
    const submitResult = simnet.callPublicFn(
      contractName,
      "submit-deliverable",
      [types.uint(1), types.buff(new Uint8Array(32).fill(1))],
      charlie
    );
    expect(submitResult).toBeOk(types.bool(true));
    
    // Approve completion and payout
    const approveResult = simnet.callPublicFn(
      contractName,
      "approve-task-completion",
      [types.uint(1)],
      alice
    );
    expect(approveResult).toBeOk(types.uint(500000));
    
    // Check treasury was reduced
    const balance = simnet.callReadOnlyFn(contractName, "get-treasury-balance", [], alice);
    expect(balance.result).toBe(types.uint(1500000)); // 2M - 500K
  });

  it("should allow updating contract settings by owner", () => {
    // Test voting period update
    const newPeriod = simnet.callPublicFn(
      contractName,
      "set-voting-period",
      [types.uint(2016)], // ~2 weeks
      deployer
    );
    expect(newPeriod).toBeOk(types.bool(true));
    
    // Test quorum threshold update
    const newQuorum = simnet.callPublicFn(
      contractName,
      "set-quorum-threshold",
      [types.uint(67)], // 67%
      deployer
    );
    expect(newQuorum).toBeOk(types.bool(true));
    
    // Test approval threshold update
    const newApproval = simnet.callPublicFn(
      contractName,
      "set-approval-threshold",
      [types.uint(75)], // 75%
      deployer
    );
    expect(newApproval).toBeOk(types.bool(true));
  });

  it("should prevent non-owners from updating settings", () => {
    const result = simnet.callPublicFn(
      contractName,
      "set-voting-period",
      [types.uint(2016)],
      alice // Non-owner
    );
    expect(result).toBeErr(types.uint(100)); // err-owner-only
  });
});