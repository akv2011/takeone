mock_provider "google" {}
variables {
  project_id         = "test-project"
  image              = "example.test/worker@sha256:fixture"
  convex_url         = "https://example.convex.cloud"
  dispatch_secret_id = "dispatch-secret"
  worker_secrets     = { WORKER_SECRET = "worker-secret" }
  gemini_model       = "gemini-fixture"
  speech_location    = "us"
  speech_model       = "chirp_3"
  tts_voice          = "en-US-Chirp3-HD-Charon"
  tts_language       = "en-US"
}
run "provider_configuration" {
  command = plan
  variables {
    worker_env = { YT_MAX_HEIGHT = "720" }
  }
}
run "reject_managed_environment_override" {
  command = plan
  variables {
    worker_env = { GCS_BUCKET = "foreign-bucket" }
  }
  expect_failures = [var.worker_env]
}

run "reject_job_identity_secret" {
  command = plan
  variables {
    worker_secrets = { WORKER_SECRET = "worker-secret", TAKEONE_JOB_ID = "foreign-job" }
  }
  expect_failures = [var.worker_secrets]
}

run "reject_upload_identity_environment" {
  command = plan
  variables {
    worker_env = { TAKEONE_UPLOAD_ID = "foreign-upload" }
  }
  expect_failures = [var.worker_env]
}

run "reject_upload_identity_secret" {
  command = plan
  variables {
    worker_secrets = { WORKER_SECRET = "worker-secret", TAKEONE_UPLOAD_ID = "foreign-upload" }
  }
  expect_failures = [var.worker_secrets]
}

run "reject_plaintext_secret_collision" {
  command = plan
  variables {
    worker_env     = { PEXELS_API_KEY = "plaintext" }
    worker_secrets = { WORKER_SECRET = "worker-secret", PEXELS_API_KEY = "pexels-secret" }
  }
  expect_failures = [google_cloud_run_v2_job.video]
}
run "veo_disabled_by_default" {
  command = plan
  assert {
    condition     = google_project_iam_member.worker_vertex.role == "roles/aiplatform.user" && contains(keys(google_project_service.api), "aiplatform.googleapis.com")
    error_message = "Gemini needs the Vertex AI API and worker grant even without Veo."
  }
  assert {
    condition     = length(setintersection(toset([for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.name]), toset(["VEO_PROJECT", "VEO_REGION", "VEO_MODEL"]))) == 0
    error_message = "Disabled Veo must not inject provider settings."
  }
}
run "veo_explicit_opt_in" {
  command = plan
  variables {
    veo = { model = "veo-3.0-generate-001", region = "us-central1" }
  }
  assert {
    condition     = contains(keys(google_project_service.api), "aiplatform.googleapis.com")
    error_message = "Veo opt-in must provision the Vertex AI API."
  }
  assert {
    condition     = google_project_iam_member.worker_vertex.role == "roles/aiplatform.user" && google_project_iam_member.worker_vertex.project == var.project_id
    error_message = "Grant Vertex AI access only to the intended project."
  }
  assert {
    condition = alltrue([for name, value in { VEO_PROJECT = "test-project", VEO_REGION = "us-central1", VEO_MODEL = "veo-3.0-generate-001" } :
      one([for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.value if env.name == name]) == value
    ])
    error_message = "Worker Veo settings must match explicit configuration."
  }
}
run "reject_unsupported_veo_model" {
  command = plan
  variables {
    veo = { model = "veo-2.0-generate-001", region = "us-central1" }
  }
  expect_failures = [var.veo]
}
run "reject_veo_override" {
  command = plan
  variables {
    worker_env = { VEO_PROJECT = "foreign-project" }
  }
  expect_failures = [google_cloud_run_v2_job.video]
}

run "private_read_cors" {
  command = plan
  variables { web_origins = ["https://staging.example.com"] }
  assert {
    condition     = google_storage_bucket.videos.public_access_prevention == "enforced" && toset(google_storage_bucket.videos.cors[0].method) == toset(["GET", "HEAD"]) && toset(google_storage_bucket.videos.cors[0].origin) == toset(["https://staging.example.com"])
    error_message = "Preview CORS must retain private storage and exact read-only origins."
  }
}
run "reject_wildcard_origin" {
  command = plan
  variables { web_origins = ["*"] }
  expect_failures = [var.web_origins]
}
run "google_environment" {
  command = plan
  assert {
    condition = alltrue([for name, value in { GEMINI_PROJECT = "test-project", GEMINI_LOCATION = "global", GEMINI_MODEL = "gemini-fixture", FIRESTORE_PROJECT = "test-project" } :
      one([for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.value if env.name == name]) == value
    ])
    error_message = "Worker Gemini and Firestore settings must come from the project and Gemini inputs."
  }
  assert {
    condition     = contains(keys(google_project_service.api), "firestore.googleapis.com")
    error_message = "Render progress needs the Firestore API."
  }
}
run "reject_gemini_override" {
  command = plan
  variables {
    worker_env = { GEMINI_MODEL = "x" }
  }
  expect_failures = [google_cloud_run_v2_job.video]
}
run "reject_non_gemini_model" {
  command = plan
  variables {
    gemini_model = "gpt-5"
  }
  expect_failures = [var.gemini_model]
}
run "regional_gemini_location" {
  command = plan
  variables {
    gemini_location = "us-central1"
  }
  assert {
    condition     = one([for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.value if env.name == "GEMINI_LOCATION"]) == "us-central1"
    error_message = "A regional Gemini location must reach the worker."
  }
}
run "worker_google_grants" {
  command = plan
  override_resource {
    target          = google_service_account.worker
    override_during = plan
    values          = { email = "takeone-worker@test-project.iam.gserviceaccount.com" }
  }
  assert {
    condition = alltrue([for grant in [google_project_iam_member.worker_vertex, google_project_iam_member.worker_firestore] :
      grant.project == var.project_id && grant.member == "serviceAccount:takeone-worker@test-project.iam.gserviceaccount.com"
    ]) && google_project_iam_member.worker_vertex.role == "roles/aiplatform.user" && google_project_iam_member.worker_firestore.role == "roles/datastore.user"
    error_message = "The worker needs Vertex AI and Firestore access on its own project."
  }
}
run "speech_tts_translate_enabled" {
  command = plan
  override_resource {
    target          = google_service_account.worker
    override_during = plan
    values          = { email = "takeone-worker@test-project.iam.gserviceaccount.com" }
  }
  assert {
    condition     = length(setsubtract(toset(["speech.googleapis.com", "texttospeech.googleapis.com", "translate.googleapis.com"]), toset(keys(google_project_service.api)))) == 0
    error_message = "Speech-to-Text, Text-to-Speech and Cloud Translation APIs must be enabled."
  }
  assert {
    condition = alltrue([for grant in [google_project_iam_member.worker_speech, google_project_iam_member.worker_translate] :
      grant.project == var.project_id && grant.member == "serviceAccount:takeone-worker@test-project.iam.gserviceaccount.com"
    ]) && google_project_iam_member.worker_speech.role == "roles/speech.client" && google_project_iam_member.worker_translate.role == "roles/cloudtranslate.user"
    error_message = "The worker needs Speech-to-Text and Cloud Translation access on its own project."
  }
  assert {
    condition = alltrue([for name, value in { SPEECH_LOCATION = "us", SPEECH_MODEL = "chirp_3", TTS_VOICE = "en-US-Chirp3-HD-Charon", TTS_LANGUAGE = "en-US" } :
      one([for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.value if env.name == name]) == value
    ])
    error_message = "Speech-to-Text and Text-to-Speech settings must come from their inputs."
  }
}
run "cover_images_disabled_by_default" {
  command = plan
  assert {
    condition     = length(setintersection(toset([for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.name]), toset(["IMAGE_MODEL", "IMAGE_LOCATION"]))) == 0
    error_message = "A null image_model must not inject cover image settings."
  }
}
run "cover_images_opt_in" {
  command = plan
  variables {
    image_model = "gemini-image-fixture"
  }
  assert {
    condition = alltrue([for name, value in { IMAGE_MODEL = "gemini-image-fixture", IMAGE_LOCATION = "global" } :
      one([for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.value if env.name == name]) == value
    ])
    error_message = "An explicit image_model must reach the worker with its location."
  }
}
run "reject_image_override" {
  command = plan
  variables {
    worker_env = { IMAGE_MODEL = "gemini-other" }
  }
  expect_failures = [google_cloud_run_v2_job.video]
}
run "reject_invalid_speech_model" {
  command = plan
  variables {
    speech_model = "Chirp-3/../x"
  }
  expect_failures = [var.speech_model]
}
run "reject_invalid_tts_voice" {
  command = plan
  variables {
    tts_voice = "en-US/../../v1beta1"
  }
  expect_failures = [var.tts_voice]
}
run "scratch_prefixes_expire" {
  command = plan
  assert {
    condition = length([for rule in google_storage_bucket.videos.lifecycle_rule : rule
      if one(rule.action).type == "Delete" && one(rule.condition).age == 1 && toset(one(rule.condition).matches_prefix) == toset(["sources/", "speech/"])
    ]) == 1
    error_message = "Speech audio and Gemini source copies must be deleted after one day."
  }
}
run "bigquery_analytics" {
  command = plan
  override_resource {
    target          = google_service_account.worker
    override_during = plan
    values          = { email = "takeone-worker@test-project.iam.gserviceaccount.com" }
  }
  override_resource {
    target          = google_service_account.dispatcher
    override_during = plan
    values          = { email = "takeone-dispatcher@test-project.iam.gserviceaccount.com" }
  }
  assert {
    condition     = google_bigquery_dataset.analytics.dataset_id == "takeone_analytics" && google_bigquery_dataset.analytics.location == var.region
    error_message = "Analytics must live in the takeone_analytics dataset in the deployment region."
  }
  assert {
    condition     = contains(keys(google_project_service.api), "bigquery.googleapis.com")
    error_message = "Analytics needs the BigQuery API."
  }
  assert {
    condition = alltrue([
      google_bigquery_table.renders.time_partitioning[0].type == "DAY", google_bigquery_table.renders.time_partitioning[0].field == "created_at",
      google_bigquery_table.feedback.time_partitioning[0].type == "DAY", google_bigquery_table.feedback.time_partitioning[0].field == "created_at",
      google_bigquery_table.renders.deletion_protection, google_bigquery_table.feedback.deletion_protection,
      google_bigquery_table.renders.dataset_id == "takeone_analytics", google_bigquery_table.feedback.dataset_id == "takeone_analytics",
    ])
    error_message = "Both analytics tables must be protected and partitioned by day on created_at."
  }
  assert {
    condition     = [for column in jsondecode(google_bigquery_table.renders.schema) : column.name] == ["job_id", "mode", "caption_language", "stage_timings", "total_seconds", "outcome", "created_at"]
    error_message = "The renders table columns must match the worker row."
  }
  assert {
    condition     = [for field in one([for column in jsondecode(google_bigquery_table.renders.schema) : column.fields if column.name == "stage_timings"]) : field.name] == ["stage", "duration_ms"]
    error_message = "Each stage timing must carry stage and duration_ms."
  }
  assert {
    condition     = [for column in jsondecode(google_bigquery_table.feedback.schema) : column.name] == ["version_id", "note_count", "sentiment", "created_at"]
    error_message = "The feedback table columns must match the dispatcher row."
  }
  assert {
    condition = alltrue([for grant in values(google_bigquery_dataset_iam_member.analytics) : grant.dataset_id == "takeone_analytics" && grant.role == "roles/bigquery.dataEditor"]) && length(google_bigquery_dataset_iam_member.analytics) == 2 && google_bigquery_dataset_iam_member.analytics["worker"].member == "serviceAccount:takeone-worker@test-project.iam.gserviceaccount.com" && google_bigquery_dataset_iam_member.analytics["dispatcher"].member == "serviceAccount:takeone-dispatcher@test-project.iam.gserviceaccount.com"
    error_message = "Only the worker and dispatcher may write analytics rows, and only in the analytics dataset."
  }
  assert {
    condition     = google_project_iam_member.dispatcher_vertex.project == var.project_id && google_project_iam_member.dispatcher_vertex.role == "roles/aiplatform.user" && google_project_iam_member.dispatcher_vertex.member == "serviceAccount:takeone-dispatcher@test-project.iam.gserviceaccount.com"
    error_message = "The dispatcher needs Vertex AI access on its own project for feedback summaries."
  }
  assert {
    condition = alltrue([for name, value in { BIGQUERY_PROJECT = "test-project", BIGQUERY_DATASET = "takeone_analytics" } :
      one([for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.value if env.name == name]) == value
    ])
    error_message = "The worker must write renders rows to the managed dataset."
  }
  assert {
    condition = alltrue([for name, value in { GEMINI_PROJECT = "test-project", GEMINI_LOCATION = "global", GEMINI_MODEL = "gemini-fixture", BIGQUERY_PROJECT = "test-project", BIGQUERY_DATASET = "takeone_analytics" } :
      one([for env in google_cloud_run_v2_service.dispatcher.template[0].containers[0].env : env.value if env.name == name]) == value
    ])
    error_message = "The dispatcher must get the same Gemini and BigQuery settings as the worker."
  }
}
run "reject_bigquery_override" {
  command = plan
  variables {
    worker_env = { BIGQUERY_DATASET = "other" }
  }
  expect_failures = [google_cloud_run_v2_job.video]
}
