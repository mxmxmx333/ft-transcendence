mod app;
mod auth;
mod game;
mod types;
mod ui;
mod websocket;

use app::{App, FatalErrors};

#[tokio::main]
async fn main() -> Result<(), FatalErrors> {
    let mut terminal = ratatui::init();
    let ret = App::new().run(&mut terminal).await;
    ratatui::restore();

    ret
}
