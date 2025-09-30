use ratatui::{
    style::Color,
    widgets::canvas::{Painter, Shape},
};

#[derive(Debug)]
pub struct Ball {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub color: Color,
}

impl Shape for Ball {
    fn draw(&self, painter: &mut Painter) {
        let x0 = (self.x - self.radius).floor() as i32;
        let x1 = (self.x + self.radius).ceil() as i32;
        let y0 = (self.y - self.radius).floor() as i32;
        let y1 = (self.y + self.radius).ceil() as i32;

        for y in y0..=y1 {
            let dy = (y as f64) - self.y;

            for x in x0..=x1 {
                let dx = (x as f64) - self.x;

                if dx * dx + dy * dy <= self.radius * self.radius {
                    if let Some((px, py)) = painter.get_point(x as f64, y as f64) {
                        painter.paint(px, py, self.color);
                    }
                }
            }
        }
    }
}
