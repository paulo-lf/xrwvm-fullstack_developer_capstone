import React, { useState } from "react";
import Header from "../Header/Header";
import "./Register.css";

function getCSRFToken() {
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("csrftoken="));

  return cookie
    ? decodeURIComponent(cookie.slice("csrftoken=".length))
    : "";
}

const fields = [
  {
    name: "userName",
    label: "Username",
    type: "text",
    autoComplete: "username",
  },
  {
    name: "firstName",
    label: "First name",
    type: "text",
    autoComplete: "given-name",
  },
  {
    name: "lastName",
    label: "Last name",
    type: "text",
    autoComplete: "family-name",
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    autoComplete: "email",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    autoComplete: "new-password",
  },
];

const Register = () => {
  const [form, setForm] = useState({
    userName: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const register = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/djangoapp/register", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRFToken(),
        },
        body: JSON.stringify(form),
      });

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        setError("Registration failed. Refresh the page and try again.");
        return;
      }

      const data = await response.json();

      if (!response.ok || data.status !== true) {
        setError(data.error || "Could not register this account.");
        return;
      }

      sessionStorage.setItem("username", data.userName);
      window.location.href = "/dealers/";
    } catch (error) {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header />

      <main className="register_container">
        <h1 className="header" style={{ fontSize: "2rem" }}>
          Sign Up
        </h1>

        <form onSubmit={register}>
          <div className="inputs">
            {fields.map((field) => (
              <label
                key={field.name}
                htmlFor={field.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <span>{field.label}</span>

                <input
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  className="input_field"
                  placeholder={field.label}
                  value={form[field.name]}
                  onChange={handleChange}
                  required
                />
              </label>
            ))}
          </div>

          {error && (
            <p
              role="alert"
              style={{ padding: "0 1rem", color: "#721c24" }}
            >
              {error}
            </p>
          )}

          <div className="submit_panel">
            <button
              className="submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Registering..." : "Register"}
            </button>
          </div>
        </form>

        <p style={{ textAlign: "center" }}>
          <a href="/">Cancel</a>
          {" · "}
          <a href="/login/">Already registered? Log in</a>
        </p>
      </main>
    </>
  );
};

export default Register;