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

  const handleRegister = async (e: React.SubmitEvent) => {
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
            const newUser = registrationResponse.data.user;
            const accessToken = registrationResponse.data.accessToken;
            navigate(`/home/${newUser.id}`);
            dispatch(
                registration({
                    user: {
                        id: newUser.id,
                        name: newUser.name,
                        email: newUser.email,
                        accessToken: accessToken
                    }
                })
            )
        } else if (registrationResponse.status === 409) {
            setError("Email Address already in use. Please try with a different email address")
        } else if (registrationResponse.status === 400) {
          setError("Validation failed");
        }
    } catch (error) {
        console.error('error while registering: ', error)
        setError('error while registering, please try again')
    } finally {
        setLoading(false)
    }
  };

  return (
    <div className="w-full h-screen flex justify-center items-center">
      <div className="w-full flex justify-center items-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Register to your account</CardTitle>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleRegister}>
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
            </form>
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
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
