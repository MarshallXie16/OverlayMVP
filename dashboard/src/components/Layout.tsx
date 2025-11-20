/**
 * Layout Component
 * Main layout wrapper with navigation bar
 */

import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo and navigation */}
            <div className="flex">
              <Link
                to="/dashboard"
                className="flex items-center px-2 text-gray-900 font-semibold text-lg"
              >
                Workflow Platform
              </Link>
            </div>

            {/* User menu */}
            {user && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700">
                  {user.name}
                </span>
                <span className="text-xs text-gray-500">
                  {user.company_name}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};
