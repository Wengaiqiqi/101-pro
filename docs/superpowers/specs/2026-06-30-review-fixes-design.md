# Review Findings Fix Design

## Goal

Remove the confirmed security, data-integrity, practice-flow, import-progress, avatar, pagination, and regression-test failures found in the full repository review.

## Design

- Startup must refuse a missing production administrator password; development keeps the documented convenience account.
- User-controlled model endpoints must resolve to public network addresses before storage and before use.
- LLM booleans must be parsed strictly; invalid option metadata and answer labels must be rejected rather than silently changing correctness.
- Forked banks must attach copied questions through the new bank relationship so foreign keys are assigned during flush.
- Import workers must commit observable progress between chunks and re-read cancellation state between external calls.
- Practice data must distinguish question delivery from answer disclosure; the frontend must support single choice, multiple choice confirmation, and true/false controls.
- Frontend polling must react to the derived active-job state. Avatar requests must use authenticated blob URLs rather than unauthenticated image tags.
- Wrong-question updates must have one API owner, and question loading must page until exhaustion.

## Testing

Add focused backend service/API tests and frontend component/hook tests for each regression. Repair stale authentication labels and HTTP-client mocks, then run the complete backend and frontend suites, TypeScript checking, and the production build.
