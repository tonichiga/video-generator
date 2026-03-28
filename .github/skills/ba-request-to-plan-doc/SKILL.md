---
name: ba-request-to-plan-doc
description: "Convert a casual user request into a structured implementation plan and technical project documentation. Use when acting as a business analyst (BA), writing scope, requirements, acceptance criteria, architecture notes, risks, and delivery plan."
argument-hint: "Describe the user request, project context, and desired output detail level."
user-invocable: true
---

# BA Request To Plan And Technical Documentation

## Purpose

Turn a plain-language request into two delivery artifacts:

1. An execution plan for the team.
2. Technical documentation for implementation and handoff.

## When To Use

- User gives a rough or incomplete feature request.
- Team needs clear scope before implementation.
- You need BA-style decomposition: goals, requirements, constraints, risks, acceptance criteria.
- You need alignment artifacts for engineering, QA, and stakeholders.

## Inputs To Collect

Capture these inputs before writing final artifacts.

1. Problem and outcome

- What business/user problem is being solved?
- What does success look like?

2. Scope boundaries

- In scope
- Out of scope

3. Constraints

- Tech stack or platform constraints
- Deadlines, compliance, security, budget

4. Stakeholders and users

- Primary user roles
- Teams affected

5. Quality and acceptance

- Non-functional expectations (performance, reliability, UX)
- Acceptance criteria and testability

If key inputs are missing, ask focused questions before proceeding.

## Workflow

1. Normalize the request

- Rewrite the original request into a short, objective problem statement.
- Remove ambiguity and subjective language.

2. Decompose into requirements

- Functional requirements (what system must do)
- Non-functional requirements (quality attributes)
- Assumptions and dependencies

3. Build delivery options

- Propose a preferred approach and, if useful, one alternative.
- Include trade-offs: complexity, timeline, risk.

4. Produce implementation plan

- Break down work into phases and tasks.
- Define owners by role (BA/ENG/QA/Design/Ops).
- Add sequencing, dependencies, and rough effort sizing.
- Use [plan template](./assets/implementation-plan-template.md).

5. Produce technical documentation

- Document architecture impact, data/contracts, API/UI changes, migration notes, observability, and rollout strategy.
- Include explicit acceptance criteria and test strategy.
- Use [technical doc template](./assets/technical-doc-template.md).

6. Run quality gate

- Verify artifacts are actionable, testable, and internally consistent.
- Confirm each requirement maps to implementation tasks and acceptance criteria.

## Decision Logic

Apply these branches while drafting.

- If request is underspecified:
  ask 3-7 focused clarification questions and pause finalization.
- If multiple implementation paths exist:
  provide at least 2 options and recommend one with rationale.
- If risk is high (security, data migration, critical path):
  include mitigation plan and rollback strategy.
- If scope creep appears:
  split into current scope vs deferred backlog.

## Completion Criteria

Artifacts are complete only when all checks pass.

1. Scope clarity

- In-scope and out-of-scope are explicit.

2. Requirement quality

- Requirements are atomic, unambiguous, and testable.

3. Plan executability

- Tasks are sequenced and dependency-aware.
- Hand-off roles are defined.

4. Technical sufficiency

- Architecture/data/API impacts are documented.
- Observability, rollout, and rollback are covered.

5. Acceptance readiness

- Acceptance criteria are measurable.
- Test strategy is mapped to criteria.

## Output Contract

Return output in this order:

1. Clarifications needed (if any)
2. Finalized problem statement
3. Implementation plan
4. Technical documentation
5. Risk and assumptions register
6. Open questions and next decision needed

Use concise, delivery-ready language and avoid vague statements.
Default format is practical Agile documentation (concise and execution-oriented).
Match the language of the user request unless they explicitly ask for another language.
