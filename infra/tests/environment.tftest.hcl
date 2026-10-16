mock_provider "google" {}
variables {
  project_id         = "test-project"
  image              = "example.test/worker@sha256:fixture"
  convex_url         = "https://example.convex.cloud"
  dispatch_secret_id = "dispatch-secret"
  worker_secrets     = { WORKER_SECRET = "worker-secret" }
  gemini_model       = "gemini-fixture"
}
run "provider_configuration" {
  command = plan
  variables {
    worker_env = { WHISPER_MODEL = "fixture-model" }
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
    worker_env     = { TTS_API_KEY = "plaintext" }
    worker_secrets = { WORKER_SECRET = "worker-secret", TTS_API_KEY = "tts-secret" }
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
