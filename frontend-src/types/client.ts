export class Client {
    email: string;
    password: string;
    nickname: string;
    firstName: string;
    lastName: string;

    constructor(email: string, password: string, nickname: string, firstName: string, lastName: string) {
        this.email = email;
        this.password = password;
        this.nickname = nickname;
        this.firstName = firstName;
        this.lastName = lastName;
    }

    saveToLocalStorageList(key: string) {
        const existingData = localStorage.getItem(key);
        let clientList: Client[] = [];

        if (existingData) {
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