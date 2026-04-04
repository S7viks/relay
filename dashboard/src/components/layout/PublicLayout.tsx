import { Link, Outlet } from 'react-router-dom'

export function PublicLayout() {
  return (
    <>
      <nav className="public-nav" aria-label="Main navigation">
        <div className="public-nav__inner">
          <Link to="/" className="public-nav__brand">
            gaiol<span className="public-nav__brand-accent">_</span>
          </Link>
          <div className="public-nav__links">
            <a href="/#features">Features</a>
            <a href="/#how">How it works</a>
            <Link to="/login">Login</Link>
            <Link to="/home">Dashboard</Link>
          </div>
          <Link to="/signup" className="public-nav__cta">
            Get your key
          </Link>
        </div>
      </nav>
      <Outlet />
    </>
  )
}
