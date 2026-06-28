# PDF Question Extraction Optimization Design

**Date:** 2026-06-29

## Objective

Improve PDF import so that original question stems, options, and formulas are transcribed completely and in source order, while reducing end-to-end processing time. The acceptance fixture is `期中考试试题.pdf`.

Answer correctness is not the primary acceptance criterion. The system may continue to infer answers for its existing review and practice workflow, but transcription completeness must take priority over answer generation.

## Evidence and Root Causes

The fixture contains two landscape A3 PDF pages, each imposing two logical A4 exam pages side by side. The current extractor reads each physical page as one text stream, which interleaves the two logical pages and disrupts question order.

The PDF contains 26 embedded image objects. Important formulas and one diagram are stored as images, so text-only extraction omits them. Existing imports confirm the impact: the source has 16 single-choice questions, while repeated runs with the same configuration produced between 10 and 24 drafts.

Local PDF text extraction takes approximately 0.40 seconds. Historical imports take approximately 52 to 197 seconds, including failures, so the dominant performance cost is the model request rather than PDF decoding.

## Selected Approach

Use a hybrid pipeline:

1. Inspect the physical PDF layout locally.
2. Split imposed landscape pages into ordered logical pages.
3. Extract ordinary text from each logical page and render the same region as an image.
4. Send logical pages to a vision-capable model in parallel with a transcription-first prompt.
5. Validate completeness deterministically and retry only incomplete logical pages.
6. Persist validated drafts in source order.

This is preferred over text-only extraction because text cannot recover embedded formula images. It is preferred over sending the complete PDF in one model call because page-level processing permits concurrency, isolated retries, progress reporting, and deterministic page ordering.

## Extraction Architecture

### Logical page detection

The PDF extractor will return logical page records rather than one unstructured string. Each record contains:

- zero-based logical page index;
- extracted text for the crop;
- rendered page image bytes;
- physical page number and crop bounds;
- extraction diagnostics, including text and image counts.

A physical page is split at its vertical midpoint only when it is sufficiently wide and evidence indicates an imposed two-page layout. Evidence includes page aspect ratio, a central gutter, and page-number text appearing independently in both halves. Otherwise, it remains a single logical page. Logical pages are emitted left-to-right, then physical-page order.

The fixture must be recognized as four logical pages in the order printed as pages 1, 2, 3, and 4.

### Text and image preparation

Text extraction remains useful for searchable Chinese text and reduces the visual model's transcription burden. Table extraction will not run unconditionally because it duplicates content and adds work. Page crops will be rendered at a resolution sufficient for Chinese text and mathematical notation, with a bounded image size to control request latency.

Images are temporary processing artifacts and are not stored after the job finishes.

### Vision model routing

PDF pages that contain embedded images, formula gaps, or complex layout use a vision-capable model. For the currently configured Xiaomi endpoint, `mimo-v2.5` is the document-vision model; the existing `mimo-v2.5-pro` setting remains the default text model. Model routing will be explicit and isolated so other OpenAI-compatible providers can use their configured multimodal model without Xiaomi-specific behavior leaking into the extraction code.

If the configured provider cannot accept images, the job fails with a clear message identifying the need for a vision-capable model. It must not silently fall back to incomplete text extraction for formula-heavy pages.

### Transcription contract

Each logical-page request receives the page image, locally extracted text, selected question types, and generation settings. The prompt must instruct the model to:

- transcribe only questions visibly present on the page;
- preserve source order and original wording;
- preserve all option labels and content;
- convert visible formulas to LaTeX;
- retain question section and source question number;
- never invent a missing stem, option, or formula;
- return strict JSON.

The response schema will include section, source number, type, stem, options, answer, explanation, difficulty, and tags. Section and source number are processing metadata used for ordering and validation; they do not need to change the published question schema.

## Concurrency and Performance

Logical-page model requests run concurrently with a bounded worker count. Database access remains on the job-processing thread; only network calls run concurrently, and their results are persisted sequentially after validation.

The HTTP client is reused across page requests. A failed or incomplete page is retried independently. The system will not repeat successful pages or restart the full document because one page failed.

For the four-page fixture, the initial concurrency is two requests at a time. This limits provider pressure while reducing two to four serial model waits to approximately two request waves. The target is an end-to-end duration below 60 seconds under normal provider response times, compared with the observed 52-to-197-second range. Provider latency is external, so the automated performance test will enforce local preparation bounds and concurrency behavior; the live fixture run will report actual wall-clock time rather than treating network variance as a deterministic unit-test failure.

## Completeness Validation

Validation runs before drafts are saved. It checks:

- question order by logical page, section, and source number;
- duplicate section/number pairs;
- missing or repeated numbers within a detected section;
- required option labels for choice questions;
- non-empty stems and option content;
- unresolved formula markers or obvious blank formula positions;
- consistency between section headings and extracted item counts where the heading declares a count.

For `期中考试试题.pdf`, the acceptance oracle is:

| Section | Expected content |
| --- | --- |
| Single choice | 16 questions, each with A-D options |
| Fill blank | 12 numbered blanks |
| True/false | 8 questions |
| Calculation | 2 questions, including their subparts |

The expected total is 38 top-level questions. Formula-bearing landmarks from the fixture will be asserted in the integration test so a run cannot pass merely by returning the correct count with blank mathematics.

When validation identifies an incomplete logical page, only that page is retried with the concrete validation failures included in the repair prompt. If it remains incomplete after the configured retry limit, the import job fails with a page-specific diagnostic rather than publishing partial drafts as though extraction succeeded.

## Compatibility and Data Flow

DOCX, DOC, TXT, and Markdown retain their current text pipeline. Text-only PDF files may use the existing text model when page diagnostics show no embedded visual content and completeness validation succeeds.

Existing import jobs, draft review, approval, publishing, and practice flows remain unchanged. `ImportJobChunk` will represent a logical page for PDF imports and a text chunk for other formats. Page requests are collected, ordered, then mapped to the current `ImportedQuestionDraft` records.

## Error Handling and Observability

Import failures will distinguish:

- PDF layout or rendering failure;
- unsupported vision input;
- provider timeout or HTTP failure;
- invalid model JSON;
- incomplete page transcription;
- duplicate or missing question numbers.

Logs will record per-stage timing without recording API keys or full document contents. Each job will report local extraction time, logical-page count, per-page model duration, retries, validation failures, and total duration.

## Test Strategy

Implementation follows test-driven development.

1. Unit tests for imposed-page detection, crop ordering, and non-imposed landscape pages.
2. Unit tests proving table extraction is not duplicated and logical-page text remains ordered.
3. Prompt and request tests proving image and text inputs are both sent to the vision model.
4. Concurrency tests using delayed fake responses to prove page requests overlap and persistence order remains stable.
5. Validation tests for missing numbers, missing A-D options, duplicate questions, blank formula positions, and page-specific retries.
6. Regression tests using `期中考试试题.pdf` for four logical pages and the 16/12/8/2 section oracle.
7. Existing backend tests to confirm non-PDF imports and publishing behavior do not regress.
8. A live provider smoke run against the fixture, reporting elapsed time and completeness results. This live run is diagnostic and is not part of the deterministic default test suite.

## Out of Scope

- Guaranteeing that inferred answers are academically correct.
- Building a general-purpose OCR service for arbitrary handwritten scans.
- Redesigning the draft review interface.
- Refactoring unrelated import, authentication, or practice functionality.

