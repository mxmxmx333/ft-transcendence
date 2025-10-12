use crossterm::event::{Event, KeyCode};
use ratatui::{
    Frame,
    layout::{Constraint, Layout, Rect},
    style::{Color, Style},
    widgets::{Block, Paragraph},
};
use tui_input::{Input, backend::crossterm::EventHandler};

use crate::auth::LoginErrors;

use super::pages::{LoginType, PageResults};

#[derive(Debug, PartialEq, Clone)]
enum Field {
    LocalLogin,
    RemoteLogin,
}

#[derive(Debug, Clone)]
pub struct HostSelectorPage {
    host: Input,
    selected_field: Field,
    needs_update: bool,
    error_message: Option<String>,
}

#[derive(Debug)]
pub enum LoginResult {
    Login((String, String)),
    Abort,
}

impl HostSelectorPage {
    pub fn new() -> Self {
        let default_host = if cfg!(debug_assertions) {
            "localhost"
        } else {
            "ft-transcendence.at"
        };

        Self {
            host: Input::default().with_value(default_host.to_string()),
            selected_field: Field::LocalLogin,
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
        focused: bool,
    ) {
        let style: Style = Color::Yellow.into();

        let text = field.value().to_owned();

        let input = Paragraph::new(text)
            .style(style)
            .block(Block::bordered().title(title));

        frame.render_widget(input, rect);

        if focused {
            let x = field.value().len() + 1;
            frame.set_cursor_position((rect.x + x as u16, rect.y + 1));
        }
    }

    pub fn render(&mut self, frame: &mut Frame) {
        let [_, horizontal, _] = Layout::horizontal([
            Constraint::Min(0),
            Constraint::Length(42),
            Constraint::Min(0),
        ])
        .areas(frame.area());

        let [_, host, local_login, remote_login, error] = Layout::vertical([
            Constraint::Percentage(30),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
        ])
        .areas(horizontal);

        self.render_input_field(
            frame,
            host,
            &self.host,
            "Hostname",
            true
            // self.selected_field.eq(&Field::Host),
        );

        let color = match self.selected_field.eq(&Field::LocalLogin) {
          true => Color::Rgb(255, 0, 255),
          false => Color::Gray,
        };
        let style: Style = color.into();

        let local = Paragraph::new("Local Login".to_owned())
          .style(style)
          .block(Block::bordered());

        frame.render_widget(local, local_login);

        let color = match self.selected_field.eq(&Field::RemoteLogin) {
          true => Color::Rgb(255, 0, 255),
          false => Color::Gray,
        };
        let style: Style = color.into();

        let remote = Paragraph::new("Remote Login through 42".to_owned())
          .style(style)
          .block(Block::bordered());

        frame.render_widget(remote, remote_login);

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
                    if self.host.value().len() < 32 && c.is_ascii_graphic() {
                          self.host.handle_event(event);
                          self.needs_update = true;
                    }
                },
                KeyCode::Backspace => {
                    self.host.handle_event(event);
                    self.needs_update = true;
                },
                KeyCode::Tab => self.focus_other_widget(),
                KeyCode::Up => {
                  self.selected_field = Field::LocalLogin;
                  self.needs_update = true;
                },
                KeyCode::Down => {
                  self.selected_field = Field::RemoteLogin;
                  self.needs_update = true;
                },
                KeyCode::Enter => {
                    if self.host.value().is_empty() {
                      self.error_message = Some("Host can't be empty".to_string());
                      self.needs_update = true;
                      return None;
                    }

                    match self.selected_field {
                        Field::LocalLogin => return Some(PageResults::HostSelected((self.host.value().to_owned(), LoginType::LocalLogin))),
                        Field::RemoteLogin => return Some(PageResults::HostSelected((self.host.value().to_owned(), LoginType::RemoteLogin))),
                    }
                },
                _ => (),
            }
        }
        None
    }

    pub fn host_error(&mut self, error: &LoginErrors) {
        self.needs_update = true;
        self.error_message = Some(error.to_string());
    }

    fn focus_other_widget(&mut self) {
        self.needs_update = true;
        self.selected_field = match self.selected_field {
            Field::LocalLogin=> Field::RemoteLogin,
            Field::RemoteLogin => Field::LocalLogin,
        }
    }

    pub fn needs_update(&self) -> bool {
        self.needs_update
    }
}
