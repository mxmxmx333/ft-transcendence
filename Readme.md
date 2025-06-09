# HTML MAP
### Header
- Includes page directions, since it has to be sigle page app, we do not reload the page.
- All buttons will display or hid the different features like (login-page, game screen, profile page)
- For different screen size purposes it does have menu icons as svgs, will be hidden till page resolution changes
### Main
- Includes login-page, game screen, profile page we can determine via their class names.
#### Update
- I remove game and profile sections out of main, as hidden purposes was not right
- at the moment u can signup than login and click newgame and play

### Typescript
- So we have to use typescript however browser would recognize it as javascript we have to 
compile typescript via tsc main.ts it will create main.js which I linked in our html file,
- Another thing is at the moment I handle gameplay(Single) and toggle(login or signup) in our
main.ts however I will need to use modules but It can wait till we start modules implementations and in our
main.ts I commented different sections and purposes already so it will be copy paste into different ts files
at the end we will have to compile them.
### Footer 
- Includes contact details, about us, copyright and pricay policy