import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
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

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
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
        const { user, accessToken } = loginResponse.data;

        const wsUrl = config.DEV_WS_URL || 'ws://localhost:8080';
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Websocket connected');
          ws.send(JSON.stringify({
            action: 'user-connected',
            userId: user.id,
            accessToken: accessToken
          }));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.action === 'connection-established') {
              console.log('User successfully added to online users list:', message);
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
              setLoading(false);
              navigate(`/home/${user.id}`);
            }
          } catch (error) {
            console.error('Error parsing message: ', error)
          }
        };

        ws.onerror = () => {
          setError('Failed to connect to the websocket server');
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('error while logging in: ', error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) setError("Looks like your account does not exist. Please register to continue!");
        else setError("error while registering, please try again")
      }

      setLoading(false);
    }
  }

  return (
    <div className="w-full h-screen flex justify-center items-center">
      <div className="w-full flex justify-center items-center">
        <form ref={formRef} onSubmit={handleLogin} className="w-full flex justify-center items-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Login to your account</CardTitle>
            <CardAction>
              <Button variant="link">Sign Up</Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            
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
        <p className="w-full flex flex-row gap-1 text-sm tracking-tight justify-center items-center py-1">
          <span className="">Don't have an account?</span>
          <a href="/register" className="hover:pointer hover:underline transition duration-300 ease-in-out">Register</a>
        </p>
      </CardFooter>
    </Card>
    </form>
      </div>
    </div>
  )
}
