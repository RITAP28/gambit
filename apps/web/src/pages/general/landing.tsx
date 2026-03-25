import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div className="bg-neutral-900 text-white min-h-screen">
      {/* HERO */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-32">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-5xl md:text-6xl font-bold tracking-tight"
        >
          <span className="text-amber-600">Gambit</span> — Play Chess, Reimagined
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mt-6 text-lg text-neutral-400 max-w-2xl"
        >
          A real-time multiplayer chess platform with intelligent game tracking,
          seamless gameplay, and a developer-first architecture.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex gap-4 mt-8"
        >
          <button
            type="button"
            className="bg-amber-600 hover:bg-amber-500 text-black px-6 py-2 rounded-md tracking-tighter font-medium hover:cursor-pointer transition duration-200 ease-in-out"
            onClick={() => navigate('/register')}
          >
            Register
          </button>
          <button
            type="button"
            className="px-6 py-2 rounded-md hover:cursor-pointer hover:bg-neutral-800 transition duration-200 ease-in-out border-[0.3px] border-neutral-800"
            onClick={() => navigate('/login')}
          >
            Login
          </button>
        </motion.div>
      </section>

      {/* FEATURES */}
      <section className="px-6 py-24 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold mb-12 text-center">
          Built for Players. Engineered for Developers. <br />
          <span className="w-full flex justify-center items-center">more coming soon...</span>
        </h2>
        

        <div className="grid md:grid-cols-2 gap-12">
          {/* User Perspective */}
          <div className="bg-neutral-800 p-8 rounded-2xl shadow-lg">
            <h3 className="text-xl font-semibold text-amber-600 mb-4">
              ♟️ Player Experience
            </h3>
            <ul className="space-y-3 text-neutral-300">
              <li>Real-time multiplayer chess with WebSocket sync</li>
              <li>Instant play via QR — no signup required {`[soon]`}</li>
              <li>Move history, chat, and smooth board interactions</li>
              <li>GitHub-style activity graph with insights</li>
              <li>Accurate timers and competitive gameplay</li>
            </ul>
          </div>

          {/* Developer Perspective */}
          <div className="bg-neutral-800 p-8 rounded-2xl shadow-lg">
            <h3 className="text-xl font-semibold text-amber-600 mb-4">
              ⚙️ Engineering Highlights
            </h3>
            <ul className="space-y-3 text-neutral-300">
              <li>Server-authoritative chess engine using chess.js</li>
              <li>Real-time communication via WebSockets</li>
              <li>Scalable architecture with Turborepo</li>
              <li>PostgreSQL + Drizzle ORM for persistence</li>
              <li>Activity aggregation pipeline for analytics</li>
            </ul>
          </div>
        </div>
      </section>

      {/* DEMO VIDEO */}
      <section className="px-6 py-24 text-center">
        <h2 className="text-3xl font-bold mb-8">See Gambit in Action</h2>

        <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-lg border border-neutral-800">
          <iframe
            className="w-full h-100"
            src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
            title="Gambit Demo"
            allowFullScreen
          ></iframe>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-neutral-800 px-6 py-10 text-center text-neutral-400">
        <div className="flex justify-center gap-6 mb-4">
          <a href="https://github.com/RITAP28/gambit" className="hover:text-amber-600 transition">GitHub</a>
          <a href="https://www.linkedin.com/in/ritap-dey-947809229/" className="hover:text-amber-600 transition">LinkedIn</a>
          <a href="https://x.com/Ritap_28" className="hover:text-amber-600 transition">Twitter</a>
        </div>

        <p className="tracking-tighter">ritap2804manutd@gmail.com</p>

        <p className="mt-4 text-sm">
          Built with ♟️ by Ritap Dey
        </p>
      </footer>
    </div>
  );
}
