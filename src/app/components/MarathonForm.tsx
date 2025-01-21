'use client';

// Version 1.0.2 - Enhanced error logging
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TrainingPlan from './TrainingPlan';
import { jsPDF } from 'jspdf';

export default function MarathonForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    raceDate: '',
    goalTime: {
      hours: '',
      minutes: '',
      seconds: ''
    },
    currentMileage: ''
  });
  
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<'initialized' | 'in_progress' | 'completed' | 'error'>('initialized');
  const [currentWeek, setCurrentWeek] = useState(0);
  const [totalWeeks, setTotalWeeks] = useState(0);
  const [weeks, setWeeks] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Poll for status updates and generate weeks
  useEffect(() => {
    if (!requestId) return;

    const pollInterval = setInterval(async () => {
      try {
        // Check current status
        const response = await fetch(`/api/generate-plan?requestId=${requestId}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to check status');
        }
        
        const data = await response.json();
        setStatus(data.status);
        setCurrentWeek(data.currentWeek);
        setTotalWeeks(data.totalWeeks);
        setWeeks(data.weeks || {});

        // If we're in progress and not currently generating a week, start the next one
        if (data.status === 'in_progress' && data.currentWeek < data.totalWeeks) {
          const nextWeek = data.currentWeek + 1;
          console.log('Starting week', nextWeek, 'generation...');
          try {
            const weekResponse = await fetch('/api/generate-plan', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requestId, weekNumber: nextWeek })
            });

            if (!weekResponse.ok) {
              const weekErrorData = await weekResponse.json();
              throw new Error(weekErrorData.error || 'Failed to generate week');
            }

            const weekData = await weekResponse.json();
            setWeeks(prev => ({
              ...prev,
              [nextWeek]: weekData.weekPlan
            }));
          } catch (weekError) {
            console.error('Error generating week:', weekError);
          }
        }

        // If completed or error, stop polling
        if (data.status === 'completed' || data.status === 'error') {
          clearInterval(pollInterval);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error checking status:', error);
        setError(error instanceof Error ? error.message : 'Failed to check status');
        clearInterval(pollInterval);
        setIsLoading(false);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [requestId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setWeeks({});
    setRequestId(null);
    setCurrentWeek(0);
    setTotalWeeks(0);
    
    try {
      // Initialize plan
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate plan');
      }
      
      const data = await response.json();
      setRequestId(data.requestId);
      setTotalWeeks(data.totalWeeks);
      setStatus('initialized');

      // Immediately start generating the first week
      console.log('Starting week 1 generation...');
      const weekResponse = await fetch('/api/generate-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          requestId: data.requestId, 
          weekNumber: 1 
        })
      });

      if (!weekResponse.ok) {
        const weekErrorData = await weekResponse.json();
        throw new Error(weekErrorData.error || 'Failed to generate first week');
      }

      const weekData = await weekResponse.json();
      setWeeks({ 1: weekData.weekPlan });
      setCurrentWeek(1);
      
    } catch (error) {
      console.error('Form submission error:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate plan. Please try again.');
      setIsLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('Marathon Training Plan', 20, 20);
    
    // Add race details
    doc.setFontSize(12);
    doc.text(`Race Date: ${formData.raceDate}`, 20, 35);
    doc.text(`Goal Time: ${formData.goalTime.hours}h ${formData.goalTime.minutes}m ${formData.goalTime.seconds}s`, 20, 45);
    doc.text(`Starting Weekly Mileage: ${formData.currentMileage} miles`, 20, 55);
    
    let yPosition = 70;
    
    // Add each week's plan
    Object.entries(weeks)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([week, plan]) => {
        // Add page break if content will overflow
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }
        
        const lines = plan.split('\n');
        lines.forEach(line => {
          if (yPosition > 280) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(line, 20, yPosition);
          yPosition += 7;
        });
        yPosition += 10;
      });
    
    // Save the PDF
    doc.save('marathon-training-plan.pdf');
  };

  // Calculate progress percentage
  const progress = totalWeeks > 0 ? (currentWeek / totalWeeks) * 100 : 0;

  return (
    <>
      <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-6 p-6">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
          <p className="mt-1 text-sm text-gray-500">
            During testing, all plans will be sent to blake.fenwick1@gmail.com. Your email will be included in the forwarded plan.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="raceDate" className="block text-sm font-medium text-white">
            When is your race?
          </label>
          <input
            type="date"
            id="raceDate"
            value={formData.raceDate}
            onChange={(e) => setFormData({ ...formData, raceDate: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">
            What is your goal finish time?
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <input
                type="number"
                placeholder="Hours"
                min="0"
                max="23"
                value={formData.goalTime.hours}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, hours: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
                required
              />
            </div>
            <div>
              <input
                type="number"
                placeholder="Minutes"
                min="0"
                max="59"
                value={formData.goalTime.minutes}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, minutes: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
                required
              />
            </div>
            <div>
              <input
                type="number"
                placeholder="Seconds"
                min="0"
                max="59"
                value={formData.goalTime.seconds}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, seconds: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="currentMileage" className="block text-sm font-medium text-white">
            How many miles per week are you currently running?
          </label>
          <input
            type="number"
            id="currentMileage"
            min="0"
            step="0.1"
            value={formData.currentMileage}
            onChange={(e) => setFormData({ ...formData, currentMileage: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black p-2"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Generating Plan...' : 'Generate Training Plan'}
        </button>

        {status === 'completed' && (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Download Training Plan (PDF)
            </button>
          </div>
        )}

        {error && (
          <div className="text-center mt-4">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {status !== 'initialized' && (
          <div className="mt-4">
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                    Progress
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold inline-block text-blue-600">
                    {Math.round(progress)}%
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                <div
                  style={{ width: `${progress}%` }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500"
                />
              </div>
              <p className="text-center text-sm text-gray-300">
                {status === 'completed'
                  ? 'Plan generation complete!'
                  : `Generating Week ${currentWeek + 1} of ${totalWeeks}`}
              </p>
            </div>
          </div>
        )}
      </form>

      {Object.entries(weeks).length > 0 && (
        <div className="space-y-4">
          {Object.entries(weeks)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([week, plan]) => (
              <TrainingPlan key={week} plan={plan} />
            ))}
        </div>
      )}
    </>
  );
} 