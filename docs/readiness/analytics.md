# Render and feedback analytics in BigQuery

TakeOne streams two kinds of rows into the `takeone_analytics` dataset, which Terraform creates in the deployment region. Both tables are partitioned by day on `created_at`, the time the row was written.

`renders` gets one row per worker run that claimed a job. The Cloud Run Job worker writes it after the run's outcome is known. Columns are `job_id`, `mode`, `caption_language`, `stage_timings` (repeated `stage` and `duration_ms`, starting with `queue_wait` on a first attempt), `total_seconds`, `outcome` and `created_at`. `total_seconds` runs from job submission in Convex (`genJobs.createdAt`) to the row write, so it covers queue time, rendering and upload. A job that loses its lease and is retried writes one row per attempt, so filter on `outcome = 'completed'` to count each finished video once. `caption_language` is null when captions stay in the spoken language.

`feedback` gets one row per Gemini feedback summary. The dispatcher writes it after Gemini answers and before it replies to Convex. Columns are `version_id` (the `genJobs` id), `note_count`, `sentiment` and `created_at`. No note text, reviewer name or theme reaches BigQuery.

## How rows get there

Both services call [`tabledata.insertAll`](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/tabledata/insertAll) over REST with the Application Default Credentials token from `backend/src/google/auth.ts` (the `cloud-platform` scope is one of the scopes the method accepts). Each call sends one row, has a 5-second timeout and sets no `insertId`, because Google's reference says best-effort deduplication is not recommended. A failed request, or a 200 response with `insertErrors`, logs one line naming the table and never fails the render or the summary. With `BIGQUERY_PROJECT` and `BIGQUERY_DATASET` unset, as in local runs, the writers skip the call.

Terraform grants `roles/bigquery.dataEditor` on this dataset only, to the worker and dispatcher service accounts. That role carries the `bigquery.tables.updateData`, `bigquery.tables.get` and `bigquery.datasets.get` permissions the reference lists for `insertAll`. The dispatcher also gets `roles/aiplatform.user` and the `GEMINI_*` settings, since it now calls Gemini for feedback summaries.

## Queries

Replace `PROJECT_ID` with the deployment project. Each query reads the last 30 days of partitions.

Upload-to-finished time per mode, p50 and p95:

```sql
SELECT
  mode,
  COUNT(*) AS renders,
  APPROX_QUANTILES(total_seconds, 100)[OFFSET(50)] AS p50_seconds,
  APPROX_QUANTILES(total_seconds, 100)[OFFSET(95)] AS p95_seconds
FROM `PROJECT_ID.takeone_analytics.renders`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND outcome = 'completed'
  AND total_seconds IS NOT NULL
GROUP BY mode
ORDER BY mode;
```

Finished renders per caption language:

```sql
SELECT
  IFNULL(caption_language, 'spoken') AS caption_language,
  COUNT(*) AS renders
FROM `PROJECT_ID.takeone_analytics.renders`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND outcome = 'completed'
GROUP BY caption_language
ORDER BY renders DESC;
```

Feedback sentiment per day:

```sql
SELECT
  DATE(created_at) AS day,
  sentiment,
  COUNT(*) AS summaries,
  SUM(note_count) AS notes
FROM `PROJECT_ID.takeone_analytics.feedback`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY day, sentiment
ORDER BY day, sentiment;
```

A version summarized three times in a day counts three times in the last query. Count `DISTINCT version_id` instead for versions.

## Evidence, 2026-10-17

All runs were on the Dell G15 from the working tree on branch `rebrand-takeone`, with mocked HTTP and no Google credentials.

- Backend `npm run typecheck` exited 0. `npx vitest run` passed 671 tests in 79 files. The new cases live in `backend/src/google/bigquery.test.ts` (URL, body, `created_at` format, no `insertId`, skip when unconfigured, `insertErrors` and network failure return false without throwing or logging row values), `backend/src/managed/worker.test.ts` (one `renders` row with queue wait and every stage, no row for a skipped claim, a throwing writer leaves the outcome alone) and the `/summarize-feedback` cases in `backend/src/managed/dispatcher.test.ts` (a rejected `feedback` write still returns the summary).
- Root `npx vitest run` passed 794 tests in 70 files. `npm run typecheck:convex` and `npm run build` exited 0. `npm run lint` reported 16 warnings and 0 errors, none in these files.
- Terraform v1.16.6 with google provider v7.46.1 and `mock_provider`, on a temp copy of `infra/`: `fmt -check` printed no diff, `validate` printed "Success! The configuration is valid.", and `terraform test` printed "Success! 26 passed, 0 failed." The `bigquery_analytics` run checks the dataset, both partitioned tables and their columns, the two `dataEditor` grants, the dispatcher's Vertex grant and the `BIGQUERY_*` and `GEMINI_*` settings. `reject_bigquery_override` checks that `worker_env` cannot redirect the dataset.
- To show the tests can fail, each guard was broken one at a time in a throwaway copy: 10 backend guards, 13 Convex behaviors and 8 Terraform settings. Every break turned at least one test red.

## Limits

These checks used mocked HTTP and mocked Terraform providers. No row reached a real BigQuery table, no query above ran against BigQuery, and nothing was deployed or applied. Staging still needs a Terraform apply, one real render and one real summary, a look at both tables, and a run of the three queries.
