import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/useAuthContext';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile, logout } = useAuthContext();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">FoconFlow</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 p-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Welcome, {profile?.full_name}
            </h2>
            <p className="text-gray-700 mb-4">
              Role: <span className="font-semibold">{profile?.role}</span>
            </p>

            {profile?.role === 'admin' ? (
              <div className="space-y-2">
                <p className="text-gray-700">Admin Dashboard Features:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li>View all time entries</li>
                  <li>Approve/reject time entries</li>
                  <li>View financial data</li>
                  <li>Manage projects and hourly rates</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-700">Member Features:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li>Register time entries</li>
                  <li>View your own time entries</li>
                  <li>View available projects</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
