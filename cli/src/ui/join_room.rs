use crossterm::event::{Event, KeyCode};
use ratatui::{
    Frame,
    layout::{Constraint, Layout},
    style::{Color, Style},
    widgets::{Block, Padding, Paragraph},
};
use tui_input::{Input, backend::crossterm::EventHandler};

use crate::websocket::events::errors::EventError;

use super::pages::PageResults;

#[derive(Debug, Clone)]
pub struct JoinRoomPage {
    input: Input,
    needs_update: bool,
    error_message: Option<String>,
}

impl JoinRoomPage {
    pub fn new() -> Self {
        Self {
            input: Input::default(),
            needs_update: true,
            error_message: None,
        }
    }

    pub fn render(&mut self, frame: &mut Frame) {
        let [_, horizontal, _] = Layout::horizontal([
            Constraint::Min(0),
            Constraint::Length(42),
            Constraint::Min(0),
        ])
        .areas(frame.area());

        let [_, area, error] = Layout::vertical([
            Constraint::Percentage(30),
            Constraint::Length(3),
            Constraint::Length(3),
        ])
        .areas(horizontal);

        let style: Style = Color::Yellow.into();
        let input = Paragraph::new(self.input.value())
            .style(style)
            // .scroll((0, scroll as u16))
            .block(
                Block::bordered()
                    .title("Room ID")
                    .padding(Padding::left(17)),
            );
        frame.render_widget(input, area);

        let x = self.input.value().len() + 18;
        frame.set_cursor_position((area.x + x as u16, area.y + 1));

        if let Some(msg) = self.error_message.as_ref() {
            let style: Style = Color::Red.into();
            let input = Paragraph::new(msg.to_owned())
                .style(style)
                .block(Block::bordered().title("Error"));
            frame.render_widget(input, error);
        }

        self.needs_update = false;
    }

    pub fn key_event(&mut self, event: &Event) -> Option<PageResults> {
        let mut event = event.to_owned();

        if let Event::Key(key) = &mut event {
            match &mut key.code {
                KeyCode::Esc => return Some(PageResults::BackToMenu),
                KeyCode::Char(c) => {
                    if self.input.value().len() < 6 && c.is_ascii_alphanumeric() {
                        *c = c.to_ascii_uppercase();
                        self.input.handle_event(&event);
                        self.needs_update = true;
                    }
                }
                KeyCode::Backspace => {
                    self.input.handle_event(&event);
                    self.needs_update = true;
                }
                KeyCode::Enter => {
                    if self.input.value().len() == 6 {
                        return Some(PageResults::JoinRoom(self.input.value().to_owned()));
                    }
                }
                _ => (),
            }
        }
        None
    }

    pub fn join_error(&mut self, error: &EventError) {
        self.error_message = Some(error.to_string());
        self.needs_update = true;
        self.input.reset();
    }

    pub fn needs_update(&self) -> bool {
        self.needs_update
    }
}
