mod app;
mod auth;
mod game;
mod types;
mod ui;
mod websocket;

use app::{App, FatalErrors};
use crossterm::{
    event::{KeyboardEnhancementFlags, PopKeyboardEnhancementFlags, PushKeyboardEnhancementFlags},
    execute,
    terminal::supports_keyboard_enhancement,
};

#[tokio::main]
async fn main() -> Result<(), FatalErrors> {
    let mut terminal = ratatui::init();

    let kitty_protocol_support =
        supports_keyboard_enhancement().map_err(FatalErrors::KeyboardEnhancementFlagsError)?;

    if kitty_protocol_support {
        execute!(
            terminal.backend_mut(),
            PushKeyboardEnhancementFlags(KeyboardEnhancementFlags::REPORT_EVENT_TYPES)
        )
        .map_err(FatalErrors::KeyboardEnhancementFlagsError)?;
    }

    let ret = App::new(kitty_protocol_support).run(&mut terminal).await;

    if kitty_protocol_support {
        execute!(terminal.backend_mut(), PopKeyboardEnhancementFlags)
            .map_err(FatalErrors::KeyboardEnhancementFlagsError)?;
    }
    ratatui::restore();

    ret
}
