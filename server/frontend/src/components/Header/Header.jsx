import React, { useState } from "react";
import useSession from "../../hooks/useSession";
import "../assets/style.css";
import "../assets/bootstrap.min.css";

const Header = () => {
  const { user, loading, error: sessionError } = useSession();
  const [error, setError] = useState("");

  const logout = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/djangoapp/logout", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || data.userName !== "") throw new Error("Logout failed.");
      sessionStorage.removeItem("username");
      window.location.href = "/dealers/";
    } catch (error) {
      setError("Could not log out. Please try again.");
    }
  };

  return (
    <>
      <nav className="navbar navbar-light" aria-label="Main navigation"
        style={{ backgroundColor: "darkturquoise", minHeight: "96px", padding: "16px 24px" }}>
        <div className="container-fluid" style={{ gap: "20px" }}>
          <a className="navbar-brand" href="/dealers/" style={{ fontSize: "1.75rem" }}>Dealerships</a>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", flex: 1 }}>
            <a className="nav-link text-dark" href="/">Home</a>
            <a className="nav-link text-dark" href="/dealers/">View Dealers</a>
            <a className="nav-link text-dark" href="/about/">About Us</a>
            <a className="nav-link text-dark" href="/contact/">Contact Us</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {loading ? <span>Checking session…</span> : user ? (
              <><span>{user.userName}</span><a href="/djangoapp/logout" onClick={logout}>Logout</a></>
            ) : (
              <><a href="/login/">Login</a><a href="/register/">Register</a></>
            )}
          </div>
        </div>
      </nav>
      {(error || sessionError) && <p role="alert" className="alert alert-danger">{error || sessionError}</p>}
    </>
  );
};

export default Header;
