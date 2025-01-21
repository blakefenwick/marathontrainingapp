import MarathonForm from './components/MarathonForm';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-white">Marathon Training Plan Generator</h1>
        <p className="text-white text-center mb-8">
          Fill out the form below to get your personalized marathon training plan.
        </p>
        <MarathonForm />
      </div>
    </main>
  );
}
