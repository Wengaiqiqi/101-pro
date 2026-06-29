# Import Answer Requirements Design

**Date:** 2026-06-29

## Objective

Ensure imported single-choice, multiple-choice, true/false, and fill-blank questions always contain usable generated answers. All other question types, including `short_answer`, may be reviewed and published without an answer.

This change applies to document import and draft publishing. It does not relax answer requirements for manually created questions.

## Root Cause

The PDF vision prompt currently prioritizes faithful transcription and does not require the model to solve questions. The latest fixture import therefore stored `{"text": ""}` for every generated draft.

The completeness validator checks numbering, options, and blank counts but not answers. Invalid drafts reach review. The publishing service then applies a single `答案不能为空` rule to every type, which rejects answerless short-answer drafts even though those answers should be optional. The draft editor likewise marks every non-choice answer field as required.

## Answer Policy

The backend will define one shared required-answer set:

- `single_choice`
- `multiple_choice`
- `true_false`
- `fill_blank`

Every other type is answer-optional. This negative rule ensures future non-objective question types remain publishable without repeatedly adding exemptions.

## Generation Contract

The page-level vision prompt will continue to transcribe the original wording, options, numbering, and formulas. In the same request it will also solve required-answer questions:

- single choice: `answer` contains exactly one valid option label;
- multiple choice: `answer` contains one or more valid option labels;
- true/false: `answer` identifies exactly one of the normalized `正确` / `错误` options;
- fill blank: `answer` contains non-empty answer text;
- all other types: `answer` may be `{}` or contain an empty text value.

The model must not omit or rewrite original question content while generating answers. Answer generation is an additional output field, not a replacement for transcription.

## Normalization and Validation

Provider-specific answer shapes will be normalized before validation. Choice labels may arrive as a string, list, or nested answer object; fill answers may arrive under `text`, `answer`, or `answer_text`.

Completeness validation will enforce:

- single-choice and true/false answers contain exactly one label present in their options;
- multiple-choice answers contain at least one label and every label is present in the options;
- fill-blank answers contain non-whitespace text;
- optional-answer types never fail validation solely because the answer is empty.

Missing or invalid required answers become page-specific validation issues. The existing repair flow will retry only the affected logical page and include the exact answer failure in the repair prompt. If the repaired page still lacks a valid answer, the import fails instead of creating knowingly unusable objective drafts.

## Publishing Behavior

Publishing retains strict answer validation for the four required-answer types. For any other type, an empty answer is stored as `answer_text=""`; the database column remains non-null and no migration is required.

Choice option correctness remains synchronized with normalized answer labels. Fill-blank answers are stored as text. Existing publishing behavior for answered questions does not change.

## Draft Review UI

When editing an answer-optional draft, the answer field will be labeled `答案（可选）` and will not use HTML `required` validation. Required-answer non-choice types, currently fill blank, continue to show a required answer field. Choice and true/false drafts continue to use correct-option controls.

The table will display `—` for an intentionally empty optional answer.

## Existing Drafts

Existing empty-answer drafts are not silently modified because doing so would require a new model request and could overwrite user review changes. Retrying or recreating the import job generates answers under the new contract.

## Error Handling

Validation messages identify the section, source question number, and failure:

- answer missing;
- answer references an unknown option;
- single-choice or true/false answer contains multiple labels;
- fill-blank answer is empty.

These messages are used both in logs and in the page repair prompt. API keys and full document content remain excluded from logs.

## Test Strategy

Implementation follows test-driven development:

1. Prompt tests prove required-answer types are explicitly solved and optional types may remain empty.
2. Normalization tests cover string, list, and object answer variants.
3. Validator tests reject missing/invalid choice, true/false, and fill answers while accepting empty short answers.
4. Repair tests prove only the page with a missing required answer is retried.
5. Publishing tests prove an empty short answer publishes with `answer_text=""` and an empty required answer is rejected.
6. Frontend tests prove answer-optional editing does not require a value.
7. Existing PDF, import, and backend regression suites remain at least as healthy as their recorded baseline.

## Out of Scope

- Guaranteeing that model-generated answers are academically correct beyond structural validation.
- Backfilling existing drafts automatically.
- Changing manual question creation requirements.
- Redesigning practice scoring for answerless optional questions.
