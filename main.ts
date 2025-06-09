window.addEventListener("load", () => {
// First thing I add form switching functionality here e stands for events
const switchToSignup = document.getElementById('switchToSignup');
const switchToLogin = document.getElementById('switchToLogin');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm')!;
const mainContent = document.getElementsByClassName("main-content")[0];
const navBarContent = document.getElementsByClassName("navbar hidden")[0];
const gameContent = document.getElementsByClassName("game-page hidden")[0];
const profilPageContent = document.getElementsByClassName("profile-page")[0];

if (switchToSignup && switchToLogin && loginForm && signupForm)
{
	switchToSignup.addEventListener('click', (e) =>
	{
		e.preventDefault();
		loginForm.classList.remove('active');
		signupForm.classList.add('active');
		switchToSignup.classList.add('hidden');
		switchToLogin.classList.remove('hidden');

	});
	switchToLogin.addEventListener('click', (e) =>
	{
		e.preventDefault();
		signupForm.classList.remove('active');
		loginForm.classList.add('active');
		switchToLogin.classList.add('hidden');
		switchToSignup.classList.remove('hidden');
	});
}

// Hamburger menü toggle ez If u didn't see it before I'll tell u how to do it
const hamlogo = document.querySelector('.hamlogo');
const hamlogo2 = document.querySelector('.hamlogo2');
const navList = document.querySelector('.nav-list');

if (hamlogo && hamlogo2 && navList)
{
	hamlogo.addEventListener('click', () =>
	{
		navList.classList.add('active');
		hamlogo.classList.add('hidden');
		hamlogo2.classList.remove('hidden');
	});

	hamlogo2.addEventListener('click', () =>
		{
		navList.classList.remove('active');
		hamlogo2.classList.add('hidden');
		hamlogo.classList.remove('hidden');
	});
}


// We do the client management with localstorage for now

/* 
DO NOT DELETE
localStorage methods
localStorage.setItem("key", "value");
localStorage.getItem("key");
localStorage.removeItem("key");
localStorage.clear();

*/

// CLIENT(USER) Manegement it has to be developed more, as nicknames or emails should not be multiples
// but it's better to handle that with server side later on.

class Client {
	email: string;
	password: string;
	nickname: string;
	firstName: string;
	lastName: string;

	constructor(email: string, password: string, nickname: string, firstName: string, lastName: string)
	{
		this.email = email;
		this.password = password;
		this.nickname = nickname;
		this.firstName = firstName;
		this.lastName = lastName;
	}

	saveToLocalStorageList(key: string)
	{
		const existingData = localStorage.getItem(key);
		let clientList: Client[] = [];

		if (existingData)
		{
			const parsed = JSON.parse(existingData);
			clientList = parsed.map((obj: any) =>
				new Client(obj.email, obj.password, obj.nickname, obj.firstName, obj.lastName)
			);
		}

	clientList.push(this);
	localStorage.setItem(key, JSON.stringify(clientList));
}


	static fromLocalStorage(key: string): Client | null {
		const data = localStorage.getItem(key);
		if (!data) return null;
		const obj = JSON.parse(data);
		return new Client(obj.email, obj.password, obj.nickname, obj.firstName, obj.lastName);
	}
	static allFromLocalStorage(key: string): Client[] {
	const data = localStorage.getItem(key);
	if (!data) return [];
	return JSON.parse(data).map((obj: any) =>
		new Client(obj.email, obj.password, obj.nickname, obj.firstName, obj.lastName)
	);
}

}


const signup_btn = document.getElementById("signup_btn") as HTMLButtonElement;

signup_btn.addEventListener("click", (e: Event) => {
	e.preventDefault();

	const nickname = (document.getElementById("signup-nickname") as HTMLInputElement).value;
	const firstName = (document.getElementById("signup-Fname") as HTMLInputElement).value;
	const lastName = (document.getElementById("signup-Lname") as HTMLInputElement).value;
	const email = (document.getElementById("signup-email") as HTMLInputElement).value;
	const password = (document.getElementById("signup-pw") as HTMLInputElement).value;

	const client = new Client(email, password, nickname, firstName, lastName);

	client.saveToLocalStorageList("signupClients");
	(document.getElementById("signup-nickname") as HTMLInputElement).value = "";
	(document.getElementById("signup-Fname") as HTMLInputElement).value = "";
	(document.getElementById("signup-Lname") as HTMLInputElement).value = "";
	(document.getElementById("signup-email") as HTMLInputElement).value = "";
	(document.getElementById("signup-pw") as HTMLInputElement).value = "";
	alert("Submissin is successfull you may login now")
	if (signupForm && loginForm && switchToLogin && switchToSignup)
	{
		signupForm.classList.remove('active');
		loginForm.classList.add('active');
		switchToLogin.classList.add('hidden');
		switchToSignup.classList.remove('hidden');
	}
});

let currentClient;
const login_btn = document.getElementById("loginsbmt") as HTMLButtonElement;

login_btn.addEventListener("click", (e: Event) => {
	e.preventDefault();

	const emailInput = (document.getElementById("login-email") as HTMLInputElement).value;
	const passwordInput = (document.getElementById("login-pw") as HTMLInputElement).value;

const storedData = localStorage.getItem("signupClients");

	if (!storedData) {
	alert("There is no such user!");
	return;
}
const clients: Client[] = JSON.parse(storedData).map((obj: any) =>
	new Client(obj.email, obj.password, obj.nickname, obj.firstName, obj.lastName)
);
let matchedClient: Client | null = null;
for (let i = 0; i < clients.length; i++) {
	if (clients[i].email === emailInput && clients[i].password === passwordInput) {
		matchedClient = clients[i];
		break;
	}
}

if (matchedClient) {
	alert("Login is Success!");

	mainContent.classList.add("hidden");
	navBarContent.classList.remove("hidden");
	profilPageContent.classList.remove("hidden");
	currentClient = matchedClient;
	(document.getElementById("profil-nickname") as HTMLElement).textContent = matchedClient.nickname;
	(document.getElementById("profil-Fname") as HTMLElement).textContent = matchedClient.firstName;
	(document.getElementById("profil-Lname") as HTMLElement).textContent = matchedClient.lastName;
	(document.getElementById("profil-email") as HTMLElement).textContent = matchedClient.email;
} else {
		alert("Email or password is not correct!");
	}
});



// Game injection

const ngame = document.getElementById("aigame") as HTMLButtonElement;

ngame.addEventListener("click", () => {
	profilPageContent.classList.add("hidden");
	gameContent.classList.remove("hidden");

	const canvas = document.querySelector('canvas.can') as HTMLCanvasElement;
	const ctx = canvas.getContext("2d")!;
	const scoreDisplay = document.getElementById("score")!;
	const nicknameDisplay = document.getElementById("game-nick")!;
	const scoreDisplay2 = document.getElementById("score2")!;
	const nicknameDisplay2 = document.getElementById("game-nick2")!;

	canvas.width = 800;
	canvas.height = 600;

	let playerScore = 0;
	let playerScore2 = 0;
	let playerY = 250;
	let aiY = 250;
	let ballX = 400, ballY = 300;
	let ballVX = 5, ballVY = 3;
	let upPressed = false;
	let downPressed = false;


	const aiSpeed = 3;
	const aiErrorMargin = 30;
	const paddleHeight = 100, paddleWidth = 15;

	function resetBall(scoredbyfirstPlayer = true) {
		ballX = canvas.width / 2;
		ballY = canvas.height / 2;
		ballVX = 5 * (Math.random() > 0.5 ? 1 : -1); // for random directions
		ballVY = 3 * (Math.random() > 0.5 ? 1 : -1);
	}
	function drawRoundedRect(ctx, x, y, width, height, radius)
	{
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.lineTo(x + width - radius, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
		ctx.lineTo(x + width, y + height - radius);
		ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
		ctx.lineTo(x + radius, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
		ctx.lineTo(x, y + radius);
		ctx.quadraticCurveTo(x, y, x + radius, y);
		ctx.closePath();
		ctx.fill();
	}

	function draw() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Middle line
		ctx.strokeStyle = "#ffff00";
		ctx.setLineDash([10, 10]);
		ctx.beginPath();
		ctx.moveTo(canvas.width / 2, 0);
		ctx.lineTo(canvas.width / 2, canvas.height);
		ctx.stroke();
		ctx.setLineDash([]);

		// First paddles were square I add some radius
		const paddleRadius = 8;

		// Player's paddle we can change colors if u want
		ctx.fillStyle = "#ff00ff";
		drawRoundedRect(ctx, 10, playerY, paddleWidth, paddleHeight, paddleRadius);

		// AI paddle
		ctx.fillStyle = "#00ffff";
		drawRoundedRect(ctx, canvas.width - 25, aiY, paddleWidth, paddleHeight, paddleRadius);


		// Ball creation
		ctx.fillStyle = "#ffff00";
		ctx.beginPath();
		ctx.arc(ballX, ballY, 10, 0, Math.PI * 2);
		ctx.fill();

		// Ball moves always
		ballX += ballVX;
		ballY += ballVY;

		// Wall hits
		if (ballY <= 0 || ballY >= canvas.height) ballVY *= -1;

		// Player paddle hits note :Oyuncu paddle çarpışması biraz daha smoot olabilir?
		if (
			ballX <= 25 &&
			ballY >= playerY &&
			ballY <= playerY + paddleHeight
		) {
			ballVX *= -1.1;
			ballVY *= 1.05;
		}

		// AI paddle hits
		if (
			ballX >= canvas.width - 25 - paddleWidth &&
			ballY >= aiY &&
			ballY <= aiY + paddleHeight
		) {
			ballVX *= -1.1;
			ballVY *= 1.05;
		}

		// AI should not be perfect so i made this
		if (ballY > aiY + paddleHeight / 2 + aiErrorMargin) aiY += aiSpeed;
		else if (ballY < aiY + paddleHeight / 2 - aiErrorMargin) aiY -= aiSpeed;

		// Player sckore check
		if (ballX > canvas.width) {
			playerScore++;
			scoreDisplay.textContent = playerScore.toString();
			resetBall(true);
		}

		// AI score check
		if (ballX < 0) {
			playerScore2++;
			scoreDisplay2.textContent = playerScore2.toString();
			resetBall(false);
		}

		// Player paddle moves
		if (upPressed) playerY -= 10;
		if (downPressed) playerY += 10;

		// making sure paddle dont go over canvas
		playerY = Math.max(0, Math.min(canvas.height - paddleHeight, playerY));

		// //For Mobile play note: for now it works but I coudn't understand why css is not working
		// const touchControls = document.querySelector(".touch-controls");

		// function checkScreenSize() {
		// if (!touchControls) return;

		// if (window.innerWidth <= 768) {
		// 	// Mobil görünüm
		// 	touchControls.classList.remove("hidden");
		// } else {
		// 	// Masaüstü görünüm
		// 	touchControls.classList.add("hidden");
		// }
		// }
		// checkScreenSize();
		// const upBtn = document.getElementById("up-btn");
		// const downBtn = document.getElementById("down-btn");

		// if (upBtn && downBtn) {
		// upBtn.addEventListener("touchstart", () => {
		// 	upPressed = true;
		// });
		// upBtn.addEventListener("touchend", () => {
		// 	upPressed = false;
		// });

		// downBtn.addEventListener("touchstart", () => {
		// 	downPressed = true;
		// });
		// downBtn.addEventListener("touchend", () => {
		// 	downPressed = false;
		// });
		// }

		requestAnimationFrame(draw);
	}

	// I was trying things Lol
	//  document.addEventListener("keydown", (e) => {
	// 	if (e.key === "ArrowUp") playerY -= 10;
	// 	else if (e.key === "ArrowDown") playerY += 10;

	// 	// Paddle ekran dışına çıkmasın
	// 	playerY = Math.max(0, Math.min(canvas.height - paddleHeight, playerY));
	// });

	document.addEventListener("keydown", (e) => {
	if (e.key === "ArrowUp") upPressed = true;
	else if (e.key === "ArrowDown") downPressed = true;
	});

	document.addEventListener("keyup", (e) => {
	if (e.key === "ArrowUp") upPressed = false;
	else if (e.key === "ArrowDown") downPressed = false;
	});

	// to display curent player
	
	if (currentClient) {
		if (currentClient.nickname)
			nicknameDisplay.textContent = currentClient.nickname;
		else
			nicknameDisplay.textContent = currentClient.lastName;
		nicknameDisplay2.textContent = "AI";
	}

	draw();
});





}); //end of window function
