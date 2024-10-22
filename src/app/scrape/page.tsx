'use client';

import React, { useState } from 'react';

interface Business {
  name: string;
  rating: number;
  address: string;
  phone: string;
  website: string;
}

const Scrape: React.FC = () => {
  const [city, setCity] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [limit, setLimit] = useState('10');
  const [minRating, setMinRating] = useState('0');
  const [timeLimit, setTimeLimit] = useState('5');
  const [results, setResults] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: { preventDefault: () => void; }) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/scrape?city=${encodeURIComponent(city)}&businessType=${encodeURIComponent(businessType)}&limit=${limit}&minRating=${minRating}&timeLimit=${timeLimit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const downloadData = {
      numberOfRecords: results.length,
      businessType,
      city,
      date: new Date().toISOString(),
      businesses: results
    };

    const jsonString = JSON.stringify(downloadData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `business_data_${city}_${businessType}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsedData = JSON.parse(event.target?.result as string);
          if (parsedData.businesses && Array.isArray(parsedData.businesses)) {
            setResults(parsedData.businesses);
          } else {
            setError('Invalid JSON structure: No "businesses" array found.');
          }
        } catch (error) {
          console.log(error);
          setError('Failed to parse JSON file.');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Business Scraper</h1>


      <form onSubmit={handleSubmit} className='w-full'>
        <div className='w-full flex flex-col justify-center items-center'>
          <div className="mb-4 w-full max-w-md relative">
            <label className='absolute -top-3 left-2 text-lg text-white/80 font-bold' htmlFor="city">City</label>
            <input
              id='city'
              type="text"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
            />
          </div>
          <div className="mb-4 w-full max-w-md relative">
            <label className='absolute -top-3 left-2 text-lg text-white/80 font-bold' htmlFor="business-type">Business Type</label>
            <input
              id='business-type'
              type="text"
              placeholder="Business Type"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
            />
          </div>
          <div className="mb-4 w-full max-w-md relative">
            <label className='absolute -top-3 left-2 text-lg text-white/80 font-bold' htmlFor="data-limit">Limit</label>
            <input
              id='data-limit'
              type="number"
              placeholder="Limit"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
            />
          </div>
          <div className="mb-4 w-full max-w-md relative">
            <label className='absolute -top-3 left-2 text-lg text-white/80 font-bold' htmlFor="min-rating">Minimum Rating</label>
            <input
              id='min-rating'
              type="number"
              step="0.1"
              placeholder="Minimum Rating"
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
            />
          </div>
          <div className="mb-4 w-full max-w-md relative">
            <label className='absolute -top-3 left-2 text-lg text-white/80 font-bold' htmlFor="time-limit">Time Limit (minutes)</label>
            <input
              id='time-limit'
              type="number"
              placeholder="Time Limit (minutes)"
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
              required
              className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
            />
          </div>
          <button
            type='submit'
            disabled={loading}
            className={`w-full max-w-md p-3 text-white font-semibold rounded-md shadow-md transition duration-200 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {loading ? 'Scraping...' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mt-6 w-full min-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-x-auto">
        <div className="p-4 flex justify-evenly items-center">
          {/* File Upload */}
          <div className="mb-4 w-full max-w-md relative">
            <label htmlFor="file-upload" className="absolute -top-3 left-2 text-lg text-white/80 font-bold">Upload JSON</label>
            <input
              id="file-upload"
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
            />
          </div>

          {/* Data download */}
          <button className='py-1.5 px-5 text-white font-semibold border border-white  rounded-md shadow-md transition duration-200 hover:bg-white/60 disabled:bg-white/60 disabled:cursor-not-allowed' type='button' onClick={handleDownload} disabled={results.length > 0 ? false : true}>
            Download Results
          </button>
        </div>
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            {/* Table headers remain the same */}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            {results?.map((business, index) => (
              <tr key={index} className="hover:bg-gray-100 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{index + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{business.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{business.rating}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {business.website ? (
                    <a href={business.website} className="text-blue-500 hover:underline">{business.website}</a>
                  ) : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{business.phone || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{business.address || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Scrape;
