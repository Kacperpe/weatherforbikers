import { LoginForm } from "./login-form";

type Props = {
  searchParams: Promise<{ message?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { message } = await searchParams;
  return <LoginForm message={message} />;
}
