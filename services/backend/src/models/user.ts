export default interface User {
  id?: number;
  nickname: string;
  email: string;
  password_hash: string;
  created_at?: string;
}
