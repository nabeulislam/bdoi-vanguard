use log::{error, info};
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub access_token: String,
    pub refresh_token: String,
    pub user: AuthUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    #[serde(default)]
    pub user_metadata: serde_json::Value,
}

impl AuthUser {
    pub fn display_name(&self) -> String {
        self.user_metadata
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&self.email)
            .to_string()
    }
}

#[derive(Debug, Serialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct AuthError {
    #[serde(default)]
    error_description: Option<String>,
    #[serde(default)]
    msg: Option<String>,
}

/// Authenticate a contestant with Supabase Auth
pub async fn login(
    supabase_url: &str,
    supabase_key: &str,
    email: &str,
    password: &str,
) -> Result<AuthSession, String> {
    let client = Client::new();
    let url = format!("{}/auth/v1/token?grant_type=password", supabase_url);

    let resp = client
        .post(&url)
        .header("apikey", supabase_key)
        .header("Content-Type", "application/json")
        .json(&LoginRequest {
            email: email.to_string(),
            password: password.to_string(),
        })
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if resp.status().is_success() {
        let session: AuthSession = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        info!("Auth: Logged in as {}", session.user.email);
        Ok(session)
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        error!("Auth failed ({}): {}", status, body);

        // Try to extract a friendly error message
        if let Ok(err) = serde_json::from_str::<AuthError>(&body) {
            Err(err
                .error_description
                .or(err.msg)
                .unwrap_or_else(|| format!("Login failed ({})", status)))
        } else {
            Err(format!("Login failed ({})", status))
        }
    }
}
