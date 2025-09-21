use std::time::Instant;

use crate::websocket::events::request::PaddleMoveDirection;

#[derive(Debug, Clone)]
pub struct Movement {
    direction: PaddleMoveDirection,
    first_keystroke: bool,
    since: Option<Instant>,
}

impl Movement {
    pub fn new() -> Self {
        Self {
            direction: PaddleMoveDirection::None,
            first_keystroke: false,
            since: None,
        }
    }

    pub fn update(&mut self, direction: &PaddleMoveDirection) {
        match direction {
            PaddleMoveDirection::None => {
                self.direction = PaddleMoveDirection::None;
                self.first_keystroke = false;
                self.since = None;
            }
            _ => {
                self.first_keystroke = self.direction.ne(direction);
                self.since = Some(Instant::now());
                self.direction = direction.clone();
            }
        }
    }

    pub fn first_keystroke(&self) -> bool {
        self.first_keystroke
    }

    pub fn movement_stopped(&mut self) -> bool {
        if self.direction != PaddleMoveDirection::None {
            let duration = self.since.unwrap().elapsed().as_millis();
            if duration >= 500 || (!self.first_keystroke && duration >= 30) {
                self.update(&PaddleMoveDirection::None);
                return true;
            }
        }
        false
    }
}
