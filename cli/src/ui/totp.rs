use crossterm::event::{Event, KeyCode};
use ratatui::{
    Frame,
    layout::{Constraint, Layout, Rect},
    style::{Color, Style},
    widgets::{Block, Paragraph},
};
use tui_input::{Input, backend::crossterm::EventHandler};

use crate::auth::{LoginErrors, TotpErrors};

use super::pages::PageResults;

#[derive(Debug, Clone)]
pub struct TotpPage {
    totp_code: Input,
    needs_update: bool,
    error_message: Option<String>,
}

impl TotpPage {
    pub fn new() -> Self {
        Self {
            totp_code: Input::default(),
            needs_update: true,
            error_message: None,
        }
    }

    fn render_input_field(
        &self,
        frame: &mut Frame,
        rect: Rect,
        field: &Input,
        title: &str,

    ) {
        let style: Style = Color::Yellow.into();

        let text = field.value().to_owned();

        let input = Paragraph::new(text)
            .style(style)
            .block(Block::bordered().title(title));

        frame.render_widget(input, rect);

        let x = field.value().len() + 1;
        frame.set_cursor_position((rect.x + x as u16, rect.y + 1));
    }

    pub fn render(&mut self, frame: &mut Frame) {
        let [_, horizontal, _] = Layout::horizontal([
            Constraint::Min(0),
            Constraint::Length(42),
            Constraint::Min(0),
        ])
        .areas(frame.area());

        let [_, totp, error] = Layout::vertical([
            Constraint::Percentage(30),
            Constraint::Length(3),
            Constraint::Length(3),
        ])
        .areas(horizontal);

        self.render_input_field(
            frame,
            totp,
            &self.totp_code,
            "2FA Code",
        );

        if let Some(msg) = &self.error_message {
            let style: Style = Color::Red.into();
            let input = Paragraph::new(msg.to_owned())
                .style(style)
                .block(Block::bordered().title("Error"));
            frame.render_widget(input, error);
        }
        self.needs_update = false;
    }

    pub fn key_event(&mut self, event: &Event) -> Option<PageResults> {
        if let Event::Key(key) = event {
            match key.code {
                KeyCode::Esc => return Some(PageResults::Exit),
                KeyCode::Char(c) => {
                    if self.totp_code.value().len() < 6 && c.is_ascii_digit() {
                        self.totp_code.handle_event(event);
                        self.needs_update = true;
                    }
                }
                KeyCode::Backspace => {
                    self.totp_code.handle_event(event);
                    self.needs_update = true;
                }
                KeyCode::Enter => {
                    if self.totp_code.value().len() != 6 {
                      self.error_message = Some("2FA code too short".to_string());
                      self.needs_update = true;
                      return None;
                    }
                    return Some(PageResults::Totp(
                        self.totp_code.value().to_owned(),
                    ));
                }
                _ => (),
            }
        }
        None
    }

    pub fn totp_error(&mut self, error: &TotpErrors) {
        self.totp_code.reset();
        self.needs_update = true;
        self.error_message = Some(error.to_string());
    }

    pub fn needs_update(&self) -> bool {
        self.needs_update
    }
}
