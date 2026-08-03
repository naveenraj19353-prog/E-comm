import { useState } from "react";
import { useLogin } from "../../hooks/auth/useLogin";
import { useTenant } from "../../hooks/tenant/useTenant";


const Login = () => {
  const { mutate, isPending, isError, error } = useLogin();
  const tenant = useTenant();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    mutate({
      tenantId: tenant?.id ?? "",
      email,
      password,
    });
  };

  return (
    <div>
      <h1>Login</h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <br />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <br />

      <button onClick={handleLogin} disabled={isPending}>
        {isPending ? "Logging in..." : "Login"}
      </button>

      {isError && (
        <p>{error instanceof Error ? error.message : "Login failed"}</p>
      )}
    </div>
  );
};

export default Login;