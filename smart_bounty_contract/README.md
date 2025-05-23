# DAO Proposal Bounty System

A decentralized autonomous organization (DAO) smart contract built on the Stacks blockchain that manages community-driven bounty tasks with automated governance and payouts.

## Overview

The DAO Proposal Bounty System enables communities to democratically propose, vote on, and execute bounty tasks. Members can submit proposals for work that needs to be done, the DAO votes on these proposals, and approved tasks are automatically converted into bounties with guaranteed payouts upon completion.

## Features

### 🗳️ Democratic Governance
- **Proposal System**: Members can create proposals for bounty tasks
- **Weighted Voting**: Configurable voting power for different members
- **Quorum & Approval Thresholds**: Customizable governance parameters
- **Time-locked Voting**: Fixed voting periods to ensure fair participation

### 💰 Automated Treasury Management
- **Secure Fund Management**: Contract-controlled treasury with STX tokens
- **Automatic Payouts**: Rewards distributed automatically upon task completion
- **Balance Verification**: Ensures sufficient funds before creating tasks

### 📋 Task Management
- **Proposal-to-Task Conversion**: Approved proposals automatically become tasks
- **Assignment System**: Tasks can be assigned to specific contributors
- **Deliverable Tracking**: Hash-based deliverable submission and verification
- **Status Tracking**: Complete lifecycle management from creation to completion

### 🔐 Access Control
- **Member-only Actions**: Restricted proposal creation and voting
- **Role-based Permissions**: Different permission levels for different actions
- **Owner Controls**: Administrative functions for DAO configuration

## Contract Architecture

### Core Components

1. **Proposals**: Community suggestions for bounty tasks
2. **Tasks**: Approved proposals converted to actionable work items
3. **Members**: Registered DAO participants with voting rights
4. **Treasury**: STX token pool for funding bounties
5. **Voting System**: Democratic decision-making mechanism

### Data Structures

```clarity
;; Proposal Structure
{
  id: uint,
  proposer: principal,
  title: string,
  description: string,
  reward-amount: uint,
  status: string,
  voting-ends-at: uint,
  votes-for: uint,
  votes-against: uint
}

;; Task Structure
{
  id: uint,
  proposal-id: uint,
  assignee: principal,
  status: string,
  reward-amount: uint,
  deliverable-hash: buff
}
```

## Getting Started

### Prerequisites

- [Clarinet](https://github.com/hirosystems/clarinet) - Stacks smart contract development tool
- [Node.js](https://nodejs.org/) - For running tests
- [Stacks Wallet](https://www.hiro.so/wallet) - For interacting with the contract

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/dao-bounty-system.git
cd dao-bounty-system
```

2. Install dependencies:
```bash
npm install
```

3. Initialize Clarinet project (if not already done):
```bash
clarinet new dao-bounty-system
```

### Development

1. Start the development environment:
```bash
clarinet console
```

2. Run tests:
```bash
clarinet test
```

3. Deploy to testnet:
```bash
clarinet deploy --testnet
```

## Usage

### 1. Set Up DAO Members

First, the contract owner needs to add DAO members with their voting power:

```clarity
(contract-call? .dao-bounty-system add-dao-member 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM u100)
```

### 2. Fund the Treasury

Members can contribute to the DAO treasury:

```clarity
(contract-call? .dao-bounty-system fund-treasury u1000000) ;; 1 STX
```

### 3. Create a Proposal

DAO members can propose new bounty tasks:

```clarity
(contract-call? .dao-bounty-system create-proposal 
  "Build Mobile App" 
  "Create a mobile app for the DAO with user authentication and proposal viewing"
  u5000000) ;; 5 STX reward
```

### 4. Vote on Proposals

Members vote on active proposals:

```clarity
(contract-call? .dao-bounty-system vote-on-proposal u1 true) ;; Vote in favor
```

### 5. Finalize Proposals

After the voting period ends, anyone can finalize the proposal:

```clarity
(contract-call? .dao-bounty-system finalize-proposal u1)
```

### 6. Work on Tasks

Approved proposals become tasks that can be assigned and completed:

```clarity
;; Assign task to a contributor
(contract-call? .dao-bounty-system assign-task u1 'ST1CONTRIBUTOR-ADDRESS)

;; Submit deliverable
(contract-call? .dao-bounty-system submit-deliverable u1 0x1234567890abcdef...)

;; Approve completion (triggers payout)
(contract-call? .dao-bounty-system approve-task-completion u1)
```

## API Reference

### Public Functions

#### Member Management
- `add-dao-member(member: principal, voting-power: uint)` - Add new DAO member
- `remove-dao-member(member: principal)` - Remove DAO member

#### Treasury
- `fund-treasury(amount: uint)` - Add funds to treasury
- `get-treasury-balance()` - Check treasury balance

#### Proposals
- `create-proposal(title, description, reward-amount)` - Create new proposal
- `vote-on-proposal(proposal-id, vote-for)` - Vote on proposal
- `finalize-proposal(proposal-id)` - Finalize voting results

#### Tasks
- `assign-task(task-id, assignee)` - Assign task to contributor
- `submit-deliverable(task-id, deliverable-hash)` - Submit completed work
- `approve-task-completion(task-id)` - Approve and payout task

#### Configuration
- `set-voting-period(new-period)` - Update voting duration
- `set-quorum-threshold(new-threshold)` - Update quorum requirement
- `set-approval-threshold(new-threshold)` - Update approval requirement

### Read-Only Functions

- `get-proposal(proposal-id)` - Get proposal details
- `get-task(task-id)` - Get task details
- `is-member(user)` - Check if user is DAO member
- `has-voted(proposal-id, voter)` - Check if user has voted
- `get-user-voting-power(user)` - Get user's voting power

## Configuration

### Default Settings

- **Voting Period**: 1008 blocks (~1 week)
- **Quorum Threshold**: 51% of total voting power must participate
- **Approval Threshold**: 60% of votes must be in favor

### Error Codes

| Code | Error | Description |
|------|-------|-------------|
| u100 | `err-owner-only` | Action restricted to contract owner |
| u101 | `err-not-found` | Requested item doesn't exist |
| u102 | `err-unauthorized` | User lacks required permissions |
| u103 | `err-invalid-status` | Action not allowed for current status |
| u104 | `err-insufficient-funds` | Not enough funds in treasury |
| u105 | `err-already-voted` | User has already voted on this proposal |
| u106 | `err-voting-closed` | Voting period has ended |
| u107 | `err-task-not-open` | Task is not available for assignment |
| u108 | `err-not-assignee` | User is not assigned to this task |
| u109 | `err-invalid-amount` | Amount must be greater than zero |

## Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- dao-bounty.test.ts

# Run tests with coverage
npm run test:coverage
```

Test categories:
- Member management
- Treasury operations
- Proposal lifecycle
- Voting mechanisms
- Task management
- Access controls
- Error conditions

## Security Considerations

- **Access Control**: Strict permission checks for all actions
- **Fund Safety**: Treasury funds are protected by contract logic
- **Voting Integrity**: One vote per member per proposal
- **Status Validation**: State transitions are strictly enforced
- **Amount Validation**: All monetary inputs are validated

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for all new functionality
- Follow Clarity best practices
- Update documentation for API changes
- Ensure all tests pass before submitting PR

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: Check the `/docs` folder for detailed guides
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Join community discussions in GitHub Discussions
- **Discord**: [Join our Discord server](https://discord.gg/your-server)

## Roadmap

- [ ] Multi-token support (beyond STX)
- [ ] Reputation system for contributors
- [ ] Proposal templates
- [ ] Integration with external work platforms
- [ ] Mobile app for DAO participation
- [ ] Advanced analytics dashboard
- [ ] Automated task verification via oracles

## Acknowledgments

- Built on [Stacks](https://www.stacks.co/) blockchain
- Inspired by existing DAO frameworks
- Community feedback and contributions

---

**Disclaimer**: This smart contract has not been audited. Use at your own risk in production environments.