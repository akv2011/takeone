terraform {
  required_version = ">= 1.6"
  backend "gcs" {}
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
  }
}
provider "google" {
  project = var.project_id
  region  = var.region
}
variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-central1"
}
variable "image" {
  type        = string
  description = "Built backend image URI, preferably pinned by digest."
}
variable "convex_url" {
  type = string
  validation {
    condition     = can(regex("^https://[a-z0-9-]+\\.convex\\.cloud$", var.convex_url))
    error_message = "Use the intended Convex deployment URL."
  }
}
variable "worker_secrets" {
  type        = map(string)
  description = "Environment variable to existing Secret Manager secret ID. WORKER_SECRET is mandatory; add TELEGRAM_BOT_TOKEN and stock provider keys such as PEXELS_API_KEY."
  validation {
    condition     = contains(keys(var.worker_secrets), "WORKER_SECRET")
    error_message = "WORKER_SECRET must be supplied."
  }
  validation {
    condition     = length(setintersection(toset(keys(var.worker_secrets)), toset(["CONVEX_URL", "GCS_BUCKET", "TAKEONE_JOB_ID", "TAKEONE_UPLOAD_ID"]))) == 0
    error_message = "Worker secrets cannot override the deployment, bucket or dispatched worker identity."
  }
}
variable "dispatch_secret_id" { type = string }
variable "worker_env" {
  type        = map(string)
  default     = {}
  description = "Non-secret worker settings such as YT_MAX_HEIGHT or SMART_CROP. Google services are configured through their dedicated inputs."
  validation {
    condition     = length(setintersection(toset(keys(var.worker_env)), toset(["CONVEX_URL", "GCS_BUCKET", "TAKEONE_JOB_ID", "TAKEONE_UPLOAD_ID", "WORKER_SECRET"]))) == 0
    error_message = "Worker environment cannot override managed deployment, bucket, worker identity or worker authentication."
  }
}
variable "veo" {
  type        = object({ model = string, region = string })
  default     = null
  description = "Optional Veo configuration in this GCP project. Null keeps the Veo environment disabled. Confirm model access, quota and cost before enabling."
  validation {
    condition     = var.veo == null ? true : can(regex("^veo-3[a-zA-Z0-9.-]+$", var.veo.model)) && can(regex("^[a-z]+-[a-z]+[0-9]$", var.veo.region))
    error_message = "Specify an explicit Veo 3 model and regional endpoint supported by the worker."
  }
}
variable "gemini_model" {
  type        = string
  description = "Gemini model ID the worker calls on Vertex AI."
  validation {
    condition     = can(regex("^gemini-[a-z0-9.-]+$", var.gemini_model))
    error_message = "Specify an explicit Gemini model ID."
  }
}
variable "gemini_location" {
  type        = string
  default     = "global"
  description = "Vertex AI location for Gemini calls, either global or a regional endpoint."
  validation {
    condition     = can(regex("^(global|[a-z]+-[a-z]+[0-9])$", var.gemini_location))
    error_message = "Use global or a regional Vertex AI location such as us-central1."
  }
}
variable "speech_location" {
  type        = string
  description = "Speech-to-Text v2 location for batch recognition, for example the us or eu multi-region where Chirp 3 runs."
  validation {
    condition     = can(regex("^[a-z]+(-[a-z]+[0-9]+)?$", var.speech_location))
    error_message = "Use a Speech-to-Text location such as us, eu or a region like asia-southeast1."
  }
}
variable "speech_model" {
  type        = string
  description = "Speech-to-Text v2 model ID, for example chirp_3."
  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{1,62}$", var.speech_model))
    error_message = "Specify an explicit Speech-to-Text model ID."
  }
}
variable "tts_voice" {
  type        = string
  description = "Text-to-Speech voice name for narration, for example a Chirp 3 HD voice."
  validation {
    condition     = can(regex("^[a-z]{2,3}-[A-Za-z0-9-]{2,100}$", var.tts_voice))
    error_message = "Specify an explicit Text-to-Speech voice name."
  }
}
variable "tts_language" {
  type        = string
  description = "BCP-47 language code of the narration voice."
  validation {
    condition     = can(regex("^[a-z]{2,3}(-[A-Za-z0-9]{2,8})+$", var.tts_language))
    error_message = "Use a BCP-47 language code with a region, such as en-US."
  }
}
variable "image_model" {
  type        = string
  default     = null
  description = "Gemini image model for cover images. Null keeps cover images disabled and injects no IMAGE_* settings."
  validation {
    condition     = var.image_model == null ? true : can(regex("^gemini-[a-z0-9.-]+$", var.image_model))
    error_message = "Specify an explicit Gemini image model ID or leave it null."
  }
}
variable "image_location" {
  type        = string
  default     = "global"
  description = "Vertex AI location for cover image calls, either global or a regional endpoint."
  validation {
    condition     = can(regex("^(global|[a-z]+-[a-z]+[0-9])$", var.image_location))
    error_message = "Use global or a regional Vertex AI location such as us-central1."
  }
}
locals {
  apis = toset(["run.googleapis.com", "storage.googleapis.com", "secretmanager.googleapis.com", "iamcredentials.googleapis.com", "aiplatform.googleapis.com", "firestore.googleapis.com", "speech.googleapis.com", "texttospeech.googleapis.com", "translate.googleapis.com"])
  google_env = {
    GEMINI_PROJECT    = var.project_id
    GEMINI_LOCATION   = var.gemini_location
    GEMINI_MODEL      = var.gemini_model
    FIRESTORE_PROJECT = var.project_id
    SPEECH_LOCATION   = var.speech_location
    SPEECH_MODEL      = var.speech_model
    TTS_VOICE         = var.tts_voice
    TTS_LANGUAGE      = var.tts_language
  }
  image_env = var.image_model == null ? {} : {
    IMAGE_MODEL    = var.image_model
    IMAGE_LOCATION = var.image_location
  }
  veo_env = var.veo == null ? {} : {
    VEO_PROJECT = var.project_id
    VEO_REGION  = var.veo.region
    VEO_MODEL   = var.veo.model
  }
}
resource "google_project_service" "api" {
  for_each           = local.apis
  service            = each.value
  disable_on_destroy = false
}
resource "google_service_account" "dispatcher" {
  account_id   = "takeone-dispatcher"
  display_name = "TakeOne managed job dispatcher"
}
resource "google_service_account" "worker" {
  account_id   = "takeone-worker"
  display_name = "TakeOne video job worker"
}
resource "google_project_iam_member" "worker_vertex" {
  project    = var.project_id
  role       = "roles/aiplatform.user"
  member     = "serviceAccount:${google_service_account.worker.email}"
  depends_on = [google_project_service.api]
}
resource "google_project_iam_member" "worker_firestore" {
  project    = var.project_id
  role       = "roles/datastore.user"
  member     = "serviceAccount:${google_service_account.worker.email}"
  depends_on = [google_project_service.api]
}
# Text-to-Speech has no predefined IAM role; a service account calling it in its own project
# needs only the enabled API. Speech-to-Text and Vertex AI read same-project gs:// objects
# through their service agents, so the bucket needs no extra grant.
resource "google_project_iam_member" "worker_speech" {
  project    = var.project_id
  role       = "roles/speech.client"
  member     = "serviceAccount:${google_service_account.worker.email}"
  depends_on = [google_project_service.api]
}
resource "google_project_iam_member" "worker_translate" {
  project    = var.project_id
  role       = "roles/cloudtranslate.user"
  member     = "serviceAccount:${google_service_account.worker.email}"
  depends_on = [google_project_service.api]
}
variable "web_origins" {
  description = "Exact HTTPS web origins allowed to read private signed videos for canvas frame previews."
  type        = list(string)
  default     = ["https://takeone.web.app"]
  validation {
    condition     = length(var.web_origins) > 0 && alltrue([for origin in var.web_origins : can(regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?$", origin))])
    error_message = "Provide exact HTTPS origins without paths or wildcards."
  }
}
variable "video_retention_days" {
  description = "Optional lifecycle deletion age for finished videos. Null keeps objects until an explicit deletion. Set only after the public retention policy and product notices match."
  type        = number
  default     = null
  validation {
    condition     = var.video_retention_days == null ? true : var.video_retention_days >= 30 && floor(var.video_retention_days) == var.video_retention_days
    error_message = "Video retention must be null or a whole number of at least 30 days."
  }
}
resource "google_storage_bucket" "videos" {
  name                        = "${var.project_id}-takeone-videos"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  cors {
    origin          = var.web_origins
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]
    max_age_seconds = 3600
  }
  # Speech-to-Text audio and Gemini copies of uploaded sources are scratch objects.
  lifecycle_rule {
    condition {
      age            = 1
      matches_prefix = ["sources/", "speech/"]
    }
    action { type = "Delete" }
  }
  dynamic "lifecycle_rule" {
    for_each = var.video_retention_days == null ? [] : [var.video_retention_days]
    content {
      condition { age = lifecycle_rule.value }
      action { type = "Delete" }
    }
  }
  depends_on = [google_project_service.api]
}
resource "google_storage_bucket_iam_member" "worker" {
  bucket = google_storage_bucket.videos.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.worker.email}"
}
resource "google_storage_bucket_iam_member" "dispatcher" {
  bucket = google_storage_bucket.videos.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.dispatcher.email}"
}
# ADC signs URLs with IAM signBlob, without local service-account keys.
resource "google_service_account_iam_member" "self_sign" {
  for_each           = { worker = google_service_account.worker.email, dispatcher = google_service_account.dispatcher.email }
  service_account_id = "projects/${var.project_id}/serviceAccounts/${each.value}"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${each.value}"
}
resource "google_secret_manager_secret_iam_member" "worker" {
  for_each  = var.worker_secrets
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}
resource "google_secret_manager_secret_iam_member" "dispatcher" {
  secret_id = var.dispatch_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.dispatcher.email}"
}
resource "google_cloud_run_v2_job" "video" {
  name                = "takeone-video"
  location            = var.region
  deletion_protection = true
  lifecycle {
    precondition {
      condition     = length(setintersection(toset(keys(var.worker_env)), toset(keys(var.worker_secrets)))) == 0
      error_message = "A worker environment variable cannot be both plaintext and a Secret Manager reference."
    }
    precondition {
      condition     = length(setintersection(setunion(toset(keys(var.worker_env)), toset(keys(var.worker_secrets))), toset(concat(["VEO_PROJECT", "VEO_REGION", "VEO_MODEL", "IMAGE_MODEL", "IMAGE_LOCATION"], keys(local.google_env))))) == 0
      error_message = "Configure Veo, Gemini, Firestore, Speech-to-Text, Text-to-Speech and cover images through their dedicated inputs, not worker_env or worker_secrets."
    }
  }
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.worker.email
      timeout         = "900s"
      max_retries     = 0 # Convex owns retries and fenced billing reservations.
      containers {
        image   = var.image
        command = ["node", "dist/managed/run.js"]
        resources {
          limits = { cpu = "2", memory = "4Gi" }
        }
        env {
          name  = "CONVEX_URL"
          value = var.convex_url
        }
        env {
          name  = "GCS_BUCKET"
          value = google_storage_bucket.videos.name
        }
        dynamic "env" {
          for_each = merge(var.worker_env, local.google_env, local.veo_env, local.image_env)
          content {
            name  = env.key
            value = env.value
          }
        }
        dynamic "env" {
          for_each = var.worker_secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
        }
      }
    }
  }
  depends_on = [google_project_service.api, google_secret_manager_secret_iam_member.worker, google_project_iam_member.worker_vertex, google_project_iam_member.worker_firestore, google_project_iam_member.worker_speech, google_project_iam_member.worker_translate]
}
resource "google_cloud_run_v2_job_iam_member" "dispatch" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.video.name
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${google_service_account.dispatcher.email}"
}
resource "google_cloud_run_v2_service" "dispatcher" {
  name                = "takeone-dispatcher"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  template {
    service_account                  = google_service_account.dispatcher.email
    max_instance_request_concurrency = 20
    timeout                          = "60s"
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    containers {
      image   = var.image
      command = ["node", "dist/managed/server.js"]
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      ports { container_port = 8080 }
      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "CLOUD_RUN_JOB"
        value = google_cloud_run_v2_job.video.name
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.videos.name
      }
      env {
        name = "DISPATCH_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.dispatch_secret_id
            version = "latest"
          }
        }
      }
    }
  }
  depends_on = [google_project_service.api, google_secret_manager_secret_iam_member.dispatcher]
}
# Convex authenticates application endpoints using DISPATCH_SECRET; /healthz is public.
resource "google_cloud_run_v2_service_iam_member" "dispatcher_http" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.dispatcher.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
output "dispatch_url" { value = google_cloud_run_v2_service.dispatcher.uri }
output "bucket" { value = google_storage_bucket.videos.name }
