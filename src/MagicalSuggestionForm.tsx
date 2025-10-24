import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { toast } from "sonner";
import { Confetti } from "./Confetti";

export function MagicalSuggestionForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const createSuggestion = useMutation(api.suggestions.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      toast.error("Please fill in your magical idea and description!");
      return;
    }

    setIsSubmitting(true);
    try {
      await createSuggestion({
        title: title.trim(),
        description: description.trim(),
        authorName: authorName.trim() || undefined,
        authorEmail: authorEmail.trim() || undefined,
      });

      // Show confetti celebration
      setShowConfetti(true);
      toast.success("✨ Your magical idea has been captured!");

      // Clear form
      setTitle("");
      setDescription("");
      setAuthorName("");
      setAuthorEmail("");
    } catch (error) {
      toast.error("Oops! The magic failed. Please try again.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfettiComplete = () => {
    setShowConfetti(false);
  };

  return (
    <>
      <Confetti isActive={showConfetti} onComplete={handleConfettiComplete} />

      <div className="max-w-2xl mx-auto mt-12">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-4 animate-pulse">
            Share Your Spark of Magic!
          </h1>
          <p className="text-xl text-purple-200 mb-8">
            Your ideas can make this place shine brighter. ✨
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-2xl magical-glow">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="title"
                className="block text-lg font-medium text-white"
              >
                Your Magical Idea
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-xl text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                placeholder="What's your brilliant idea? ✨"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="description"
                className="block text-lg font-medium text-white"
              >
                Tell us more about your magic
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-xl text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all duration-300 resize-none"
                placeholder="Describe your magical vision in detail..."
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="block text-lg font-medium text-white"
                >
                  Your name (optional)
                </label>
                <input
                  type="text"
                  id="name"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-xl text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                  placeholder="Your magical name"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-lg font-medium text-white"
                >
                  Your email (optional)
                </label>
                <input
                  type="email"
                  id="email"
                  value={authorEmail}
                  onChange={(e) => setAuthorEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-xl text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                  placeholder="your@email.com"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !description.trim()}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 px-6 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 magical-button"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Casting your spell...
                </span>
              ) : (
                "✨ Share Your Magic ✨"
              )}
            </button>
          </form>

          <div className="text-center mt-6">
            <p className="text-purple-200 italic">
              Every great idea starts with a single spark
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
