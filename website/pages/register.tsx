import AuthContainer from "../components/AuthContainer"

export default function Register() {
  return (
    <AuthContainer title="Create an account">
      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            type="email"
            placeholder="you@bakery.com"
            className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-bakery-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Password
          </label>
          <input
            type="password"
            placeholder="Create a password"
            className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-bakery-accent"
          />
        </div>

        <button
          type="button"
          className="w-full bg-bakery-accent text-white py-3 rounded-xl font-semibold"
        >
          Create account
        </button>
      </form>

      <p className="text-sm text-center text-bakery-muted mt-6">
        Already have an account?{" "}
        <a href="/login" className="text-bakery-ink underline">
          Sign in
        </a>
      </p>
    </AuthContainer>
  )
}
