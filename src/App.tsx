import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { MagicalSuggestionForm } from "./MagicalSuggestionForm";
import { AdminDashboard } from "./AdminDashboard";
import { useState } from "react";
import { Shield, Sparkles } from "lucide-react";

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const loggedInUser = useQuery(api.auth.loggedInUser);

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900 relative overflow-hidden">
      {/* Animated background sparkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="sparkle sparkle-1"></div>
        <div className="sparkle sparkle-2"></div>
        <div className="sparkle sparkle-3"></div>
        <div className="sparkle sparkle-4"></div>
        <div className="sparkle sparkle-5"></div>
        <div className="sparkle sparkle-6"></div>
      </div>

      <header className="relative z-10 bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6" />
            Magical Ideas
          </h1>

          <div className="flex items-center gap-4">
            <Authenticated>
              <button
                onClick={() => setShowAdmin(!showAdmin)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all duration-300 backdrop-blur-xs border border-white/30"
              >
                {showAdmin ? "Public View" : "Admin Dashboard"}
              </button>
              <SignOutButton />
            </Authenticated>
            <Unauthenticated>
              <button
                onClick={() => setShowAdmin(!showAdmin)}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all duration-300 backdrop-blur-xs border border-white/30"
              >
                <Shield className="w-4 h-4" />
                <span>Admin</span>
              </button>
            </Unauthenticated>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 p-8">
        <Authenticated>
          {showAdmin ? <AdminDashboard /> : <MagicalSuggestionForm />}
        </Authenticated>

        <Unauthenticated>
          {showAdmin ? (
            <div className="max-w-md mx-auto mt-20">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
                <h2 className="text-2xl font-bold text-white text-center mb-6">
                  Admin Login
                </h2>
                <SignInForm />
              </div>
            </div>
          ) : (
            <MagicalSuggestionForm />
          )}
        </Unauthenticated>
      </main>

      <Toaster />
    </div>
  );
}
