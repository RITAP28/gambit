import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import config from "@/infra/activeconfig"
import { registration } from "@/redux/slices/auth.slice"
import axios from "axios"
import React, { useRef, useState } from "react"
import { useDispatch } from "react-redux"
import { useNavigate } from 'react-router-dom'

export function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [name, setName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState<string | null>(null)

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const formRef = useRef<HTMLFormElement>(null)

  const handleRegister = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // validating the inputs
    if (!name || !email || !password) {
        setError('all the above fields are required')
        setLoading(false)
        return
    };

    try {
        const registrationResponse = await axios.post(
            `${config.DEV_BASE_URL}`,
            {
              action: 'register-user',
              data: { name: name, email: email, password: password }
            },
            {
              headers: { 'Content-Type': 'application/json' }
            }
        );

        if (registrationResponse.status === 201) {
            console.log('registration response: ', registrationResponse.data);
            const {user: newUser, accessToken } = registrationResponse.data;

            // connecting to websocket server after successful registration
            const wsUrl = config.DEV_WS_URL || 'ws://localhost:8080'
            const ws = new WebSocket(wsUrl);

            // sending user info to websocket server
            ws.onopen = () => {
              console.log('Websocket connected');
              ws.send(JSON.stringify({
                action: 'user-connected',
                userId: newUser.id,
                accessToken: accessToken
              }));
            };

            ws.onmessage = (event) => {
              try {
                const message = JSON.parse(event.data);
                if (message.action === 'connection-established') {
                  console.log('User successfully added to online users list: ', message);
                  
                  // navigate after websocket connection
                  dispatch(
                    registration({
                      user: {
                        id: newUser.id,
                        name: newUser.name,
                        email: newUser.email,
                        accessToken: accessToken
                      }
                    })
                  );
                  setLoading(false);
                  navigate(`/home/${newUser.id}`);
                }
              } catch (error) {
                console.error('Error parsing WS message: ', error);
              };
            };

            ws.onerror = () => {
              setError('Failed to connect to server');
              setLoading(false);
            };
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          if (status === 409) setError("Email already in use");
          else if (status === 400) setError("Validation failed");
          else setError("Error while registering, please try again");
        } else {
          setError('Unexpected error, please try again.');
        }

        setLoading(false);
    }
  };

  return (
    <div className="w-full h-screen flex justify-center items-center">
      <div className="w-full flex justify-center items-center">
        <form ref={formRef} onSubmit={handleRegister} className="w-full flex justify-center items-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Register to your account</CardTitle>
          </CardHeader>
          <CardContent>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    required
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  />
                </div>
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  required
                />
                </div>
              </div>
            
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Registering you..." : "Register"}
            </Button>
            {error && (
              <div className="w-full">
                <p className="text-sm tracking-tight text-red-400">
                  {error}
                </p>
              </div>
            )}
            <Button variant="outline" className="w-full">Login with Google</Button>

            <p className="w-full flex flex-row gap-1 text-sm tracking-tight justify-center items-center py-1">
              <span className="">Already have an account?</span>
              <a href="/login" className="hover:pointer hover:underline transition duration-300 ease-in-out">Login</a>
            </p>
          </CardFooter>
        </Card>
        </form>
      </div>
    </div>
  )
}
