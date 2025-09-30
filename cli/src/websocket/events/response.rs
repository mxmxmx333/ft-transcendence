use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize, Debug)]
pub struct EventResponse(String, Value);

impl EventResponse {
    pub fn get_type(&self) -> &str {
        &self.0
    }

    pub fn get_value(&self) -> &Value {
        &self.1
    }
}
