import MarathonForm from './components/MarathonForm';

// Version 1.1.0 - Full email and Redis integration
export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-center text-white mb-8">
          Marathon Training Plan Generator
        </h1>
        <p className="text-gray-300 text-center mb-12">
          Generate a personalized training plan for your next marathon.
        </p>
        <MarathonForm />
      </div>
    </main>
  );
}
