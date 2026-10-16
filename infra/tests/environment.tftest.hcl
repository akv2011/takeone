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
    condition     = alltrue([for grant in values(google_bigquery_dataset_iam_member.analytics) : grant.dataset_id == "takeone_analytics" && grant.role == "roles/bigquery.dataEditor"]) && length(google_bigquery_dataset_iam_member.analytics) == 2 && google_bigquery_dataset_iam_member.analytics["worker"].member == "serviceAccount:takeone-worker@test-project.iam.gserviceaccount.com" && google_bigquery_dataset_iam_member.analytics["dispatcher"].member == "serviceAccount:takeone-dispatcher@test-project.iam.gserviceaccount.com"
    error_message = "Only the worker and dispatcher may write analytics rows, and only in the analytics dataset."
  }
  assert {
    condition     = google_project_iam_member.dispatcher_vertex.project == var.project_id && google_project_iam_member.dispatcher_vertex.role == "roles/aiplatform.user" && google_project_iam_member.dispatcher_vertex.member == "serviceAccount:takeone-dispatcher@test-project.iam.gserviceaccount.com"
    error_message = "The dispatcher needs Vertex AI access on its own project for feedback summaries."
  }
  assert {
    condition     = google_project_iam_member.dispatcher_translate.project == var.project_id && google_project_iam_member.dispatcher_translate.role == "roles/cloudtranslate.user" && google_project_iam_member.dispatcher_translate.member == "serviceAccount:takeone-dispatcher@test-project.iam.gserviceaccount.com"
    error_message = "The dispatcher needs Cloud Translation access on its own project for YouTube moment captions."
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
run "warm_worker_service" {
  command = plan
  variables {
    worker_env     = { YT_MAX_HEIGHT = "720" }
    worker_secrets = { WORKER_SECRET = "worker-secret", PEXELS_API_KEY = "pexels-secret" }
  }
  override_resource {
    target          = google_service_account.worker
    override_during = plan
    values          = { email = "takeone-worker@test-project.iam.gserviceaccount.com" }
  }
  assert {
    condition = alltrue([
      google_cloud_run_v2_service.worker.name == "takeone-worker",
      google_cloud_run_v2_service.worker.ingress == "INGRESS_TRAFFIC_INTERNAL_ONLY",
      google_cloud_run_v2_service.worker.template[0].service_account == "takeone-worker@test-project.iam.gserviceaccount.com",
      google_cloud_run_v2_service.worker.template[0].max_instance_request_concurrency == 1,
      google_cloud_run_v2_service.worker.template[0].timeout == "900s",
      google_cloud_run_v2_service.worker.template[0].scaling[0].min_instance_count == 1,
      google_cloud_run_v2_service.worker.template[0].scaling[0].max_instance_count == 8,
      google_cloud_run_v2_service.worker.template[0].containers[0].command == tolist(["node", "dist/managed/workerService.js"]),
      google_cloud_run_v2_service.worker.template[0].containers[0].resources[0].limits == tomap({ cpu = "2", memory = "4Gi" }),
      google_cloud_run_v2_service.worker.template[0].containers[0].resources[0].cpu_idle,
    ])
    error_message = "The warm worker must run one render per instance for up to 900s on the job's machine shape, with internal ingress and the worker identity."
  }
  assert {
    condition = alltrue([
      { for env in google_cloud_run_v2_service.worker.template[0].containers[0].env : env.name => env.value if length(env.value_source) == 0 } == { for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.name => env.value if length(env.value_source) == 0 },
      { for env in google_cloud_run_v2_service.worker.template[0].containers[0].env : env.name => env.value_source[0].secret_key_ref[0].secret if length(env.value_source) > 0 } == { for env in google_cloud_run_v2_job.video.template[0].template[0].containers[0].env : env.name => env.value_source[0].secret_key_ref[0].secret if length(env.value_source) > 0 },
      one([for env in google_cloud_run_v2_service.worker.template[0].containers[0].env : env.value if env.name == "YT_MAX_HEIGHT"]) == "720",
      one([for env in google_cloud_run_v2_service.worker.template[0].containers[0].env : env.value_source[0].secret_key_ref[0].secret if env.name == "PEXELS_API_KEY"]) == "pexels-secret",
    ])
    error_message = "The warm worker must receive exactly the job's plaintext settings and secret references."
  }
}
run "render_queue" {
  command = plan
  variables {
    worker_max_instances = 7
  }
  assert {
    condition = alltrue([
      google_cloud_tasks_queue.render.name == "takeone-render",
      google_cloud_tasks_queue.render.location == var.region,
      google_cloud_tasks_queue.render.rate_limits[0].max_concurrent_dispatches == 7,
      google_cloud_run_v2_service.worker.template[0].scaling[0].max_instance_count == 7,
      google_cloud_tasks_queue.render.retry_config[0].max_attempts == 2,
      contains(keys(google_project_service.api), "cloudtasks.googleapis.com"),
    ])
    error_message = "The render queue must dispatch no more requests than worker instances, retry delivery once, and have the Cloud Tasks API enabled."
  }
}
run "tasks_iam" {
  command = plan
  override_resource {
    target          = google_service_account.dispatcher
    override_during = plan
    values          = { email = "takeone-dispatcher@test-project.iam.gserviceaccount.com" }
  }
  override_resource {
    target          = google_service_account.tasks_invoker
    override_during = plan
    values = {
      email = "takeone-tasks-invoker@test-project.iam.gserviceaccount.com"
      name  = "projects/test-project/serviceAccounts/takeone-tasks-invoker@test-project.iam.gserviceaccount.com"
    }
  }
  override_data {
    target          = data.google_project.this
    override_during = plan
    values          = { number = "123456789" }
  }
  assert {
    condition = alltrue([
      google_cloud_run_v2_service_iam_member.worker_tasks.name == "takeone-worker",
      google_cloud_run_v2_service_iam_member.worker_tasks.role == "roles/run.invoker",
      google_cloud_run_v2_service_iam_member.worker_tasks.member == "serviceAccount:takeone-tasks-invoker@test-project.iam.gserviceaccount.com",
      google_cloud_run_v2_service_iam_member.dispatcher_http.name == "takeone-dispatcher",
    ])
    error_message = "Only the Cloud Tasks invoker may call takeone-worker; allUsers stays on the dispatcher."
  }
  assert {
    condition = alltrue([
      google_cloud_tasks_queue_iam_member.dispatcher.project == var.project_id,
      google_cloud_tasks_queue_iam_member.dispatcher.location == var.region,
      google_cloud_tasks_queue_iam_member.dispatcher.name == "takeone-render",
      google_cloud_tasks_queue_iam_member.dispatcher.role == "roles/cloudtasks.enqueuer",
      google_cloud_tasks_queue_iam_member.dispatcher.member == "serviceAccount:takeone-dispatcher@test-project.iam.gserviceaccount.com",
    ])
    error_message = "The dispatcher must be able to enqueue on the render queue only."
  }
  assert {
    condition = alltrue([for grant in values(google_service_account_iam_member.tasks_invoker_user) :
      grant.role == "roles/iam.serviceAccountUser" && grant.service_account_id == "projects/test-project/serviceAccounts/takeone-tasks-invoker@test-project.iam.gserviceaccount.com"
      ]) && toset([for grant in values(google_service_account_iam_member.tasks_invoker_user) : grant.member]) == toset([
      "serviceAccount:takeone-dispatcher@test-project.iam.gserviceaccount.com",
      "serviceAccount:service-123456789@gcp-sa-cloudtasks.iam.gserviceaccount.com",
    ]) && length(google_service_account_iam_member.tasks_invoker_user) == 2
    error_message = "Only the dispatcher and the Cloud Tasks service agent may act as the invoker service account."
  }
}
run "dispatcher_defaults_to_jobs" {
  command = plan
  override_resource {
    target          = google_cloud_tasks_queue.render
    override_during = plan
    values          = { id = "projects/test-project/locations/us-central1/queues/takeone-render" }
  }
  override_resource {
    target          = google_cloud_run_v2_service.worker
    override_during = plan
    values          = { uri = "https://takeone-worker-fixture-uc.a.run.app" }
  }
  override_resource {
    target          = google_service_account.tasks_invoker
    override_during = plan
    values = {
      email = "takeone-tasks-invoker@test-project.iam.gserviceaccount.com"
      name  = "projects/test-project/serviceAccounts/takeone-tasks-invoker@test-project.iam.gserviceaccount.com"
    }
  }
  assert {
    condition = alltrue([for name, value in {
      RENDER_DISPATCH    = "jobs"
      RENDER_JOB         = "takeone-video"
      TASKS_QUEUE        = "projects/test-project/locations/us-central1/queues/takeone-render"
      WORKER_SERVICE_URL = "https://takeone-worker-fixture-uc.a.run.app"
      TASKS_INVOKER_SA   = "takeone-tasks-invoker@test-project.iam.gserviceaccount.com"
      } :
      one([for env in google_cloud_run_v2_service.dispatcher.template[0].containers[0].env : env.value if env.name == name]) == value
    ])
    error_message = "The dispatcher must default to jobs and know the queue, worker URL and invoker for tasks mode."
  }
  assert {
    condition     = google_cloud_run_v2_job.video.name == "takeone-video" && google_cloud_run_v2_job_iam_member.dispatch.name == "takeone-video" && google_cloud_run_v2_job_iam_member.dispatch.role == "roles/run.jobsExecutorWithOverrides"
    error_message = "The Cloud Run Job and its dispatcher grant must stay for rollback."
  }
}
run "dispatcher_tasks_opt_in" {
  command = plan
  variables {
    render_dispatch = "tasks"
  }
  assert {
    condition     = one([for env in google_cloud_run_v2_service.dispatcher.template[0].containers[0].env : env.value if env.name == "RENDER_DISPATCH"]) == "tasks"
    error_message = "An explicit tasks dispatch must reach the dispatcher."
  }
}
run "reject_unknown_dispatch" {
  command = plan
  variables {
    render_dispatch = "lambda"
  }
  expect_failures = [var.render_dispatch]
}
run "reject_negative_min_instances" {
  command = plan
  variables {
    worker_min_instances = -1
  }
  expect_failures = [var.worker_min_instances]
}
run "reject_fractional_max_instances" {
  command = plan
  variables {
    worker_max_instances = 2.5
  }
  expect_failures = [var.worker_max_instances]
}
