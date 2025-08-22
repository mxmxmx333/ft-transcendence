use crossterm::event::{Event, KeyCode};
use ratatui::{
    Frame,
    layout::{Constraint, Layout, Rect},
    style::{Color, Style},
    widgets::{Block, Paragraph},
};
use tui_input::{Input, backend::crossterm::EventHandler};

use crate::auth::LoginErrors;

use super::pages::PageResults;

#[derive(Debug, PartialEq, Clone)]
enum Field {
    Email,
    Password,
}

#[derive(Debug, Clone)]
pub struct LoginPage {
    email: Input,
    password: Input,
    selected_field: Field,
    needs_update: bool,
    error_message: Option<String>,
}

#[derive(Debug)]
pub enum LoginResult {
    Login(String),
    Abort,
}

impl LoginPage {
    pub fn new() -> Self {
        Self {
            email: Input::default(),
            password: Input::default(),
            selected_field: Field::Email,
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
        password: bool,
    ) {
        let style: Style = Color::Yellow.into();

        let text = match password {
            true => (0..field.value().len()).map(|_| '*').collect(),
            false => field.value().to_owned(),
        };

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

        let [_, email, password, error] = Layout::vertical([
            Constraint::Percentage(30),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
        ])
        .areas(horizontal);

        self.render_input_field(
            frame,
            email,
            &self.email,
            "E-Mail",
            self.selected_field.eq(&Field::Email),
            false,
        );
        self.render_input_field(
            frame,
            password,
            &self.password,
            "Password",
            self.selected_field.eq(&Field::Password),
            true,
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
        let current_widget = match self.selected_field {
            Field::Email => &mut self.email,
            Field::Password => &mut self.password,
        };

        if let Event::Key(key) = event {
            match key.code {
                KeyCode::Esc => return Some(PageResults::Exit),
                KeyCode::Char(c) => {
                    if current_widget.value().len() < 32 && c.is_ascii_graphic() {
                        current_widget.handle_event(event);
                        self.needs_update = true;
                    }
                }
                KeyCode::Backspace => {
                    current_widget.handle_event(event);
                    self.needs_update = true;
                }
                KeyCode::Tab => self.focus_other_widget(),
                KeyCode::Enter => {
                    if self.selected_field.eq(&Field::Email) {
                        self.focus_other_widget();
                    } else {
                        return Some(PageResults::Login((
                            self.email.value().to_owned(),
                            self.password.value().to_owned(),
                        )));
                    }
                }
                _ => (),
            }
        }
        None
    }

    pub fn login_error(&mut self, error: &LoginErrors) {
        self.password.reset();
        self.selected_field = Field::Password;
        self.needs_update = true;
        self.error_message = Some(error.to_string());
    }

    fn focus_other_widget(&mut self) {
        self.needs_update = true;
        self.selected_field = match self.selected_field {
            Field::Email => Field::Password,
            Field::Password => Field::Email,
        }
    }

    pub fn needs_update(&self) -> bool {
        self.needs_update
    }
}
