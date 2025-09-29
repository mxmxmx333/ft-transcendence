use ratatui::{
    style::Color,
    widgets::canvas::{Line, Painter, Shape},
};

#[derive(Debug)]
pub struct FilledRectangle {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub color: Color,
}

impl Shape for FilledRectangle {
    fn draw(&self, painter: &mut Painter) {
        let x0 = self.x as i64;
        let x1 = (self.x + self.width).round() as i64;

        for x in x0..=x1 {
            Line {
                x1: x as f64,
                y1: self.y + self.width / 2.0,
                x2: x as f64,
                y2: self.y + self.height - self.width / 2.0,
                color: self.color,
            }
            .draw(painter);
        }
    }
}
