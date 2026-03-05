import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import config from "@/infra/activeconfig"
import { login } from "@/redux/slices/auth.slice"
import axios from "axios"
import React, { useRef, useState } from "react"
import { useDispatch } from "react-redux"
import { useNavigate } from "react-router-dom"

export function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  const handleLogin = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!email || !password) {
      setError('all the above fields are required');
      setLoading(false);
      return;
    };

    try {
      const loginResponse = await axios.post(
        `${config.DEV_BASE_URL}`,
        {
          action: 'login-user',
          data: {
            email: email,
            password: password
          }
        }, {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      if (loginResponse.status === 200) {
        console.log('login response: ', loginResponse.data);
        const user = loginResponse.data.user;
        const accessToken = loginResponse.data.accessToken;
        dispatch(
          login({
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              accessToken: accessToken,
            },
            isAuthenticated: true,
          })
        );

        navigate(`/home/${user.id}`);
      } else if (loginResponse.status === 404) {
        setError("Looks like your account does not exist. Please register to continue!");
      }
    } catch (error) {
      console.error('error while logging in: ', error);
      setError('error while registering, please try again')
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
        <CardAction>
          <Button variant="link">Sign Up</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleLogin}>
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <a
                  href="#"
                  className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                required
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </Button>
        {error && (
          <div className="w-full tracking-tight text-red-400">
            {error}
          </div>
        )}
        <Button variant="outline" className="w-full">
          Login with Google
        </Button>
      </CardFooter>
    </Card>
  )
}
