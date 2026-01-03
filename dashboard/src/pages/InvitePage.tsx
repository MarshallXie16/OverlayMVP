/**
 * Invite Landing Page
 * Shows company name and prompts user to accept invitation
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader2, Users, ArrowRight, AlertCircle } from "lucide-react";
import { apiClient } from "@/api/client";

export const InvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid invite link");
      setIsLoading(false);
      return;
    }

    const fetchInviteInfo = async () => {
      try {
        const response = await apiClient.getInviteInfo(token);
        setCompanyName(response.company_name);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Invalid or expired invite link",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchInviteInfo();
  }, [token]);

  const handleAcceptInvite = () => {
    navigate(`/signup?invite=${token}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-50 via-neutral-50 to-neutral-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-neutral-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-50 via-neutral-50 to-neutral-100">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              Invalid Invitation
            </h1>
            <p className="text-neutral-600 mb-6">{error}</p>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-lg text-white bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-400 hover:to-accent-500 font-semibold shadow-md transition-all duration-200"
            >
              Create a New Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-50 via-neutral-50 to-neutral-100">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 p-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center mx-auto mb-6">
            <Users className="h-10 w-10 text-primary-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            You&apos;ve been invited!
          </h1>

          {/* Company Name */}
          <p className="text-neutral-600 mb-8">
            Join the{" "}
            <span className="font-semibold text-primary-700">
              {companyName}
            </span>{" "}
            team on FlowGuide to collaborate on workflow automation.
          </p>

          {/* Accept Button */}
          <button
            onClick={handleAcceptInvite}
            className="group w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg text-white bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-400 hover:to-accent-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 font-semibold shadow-md transition-all duration-200 hover:-translate-y-0.5 mb-4"
          >
            Accept Invitation
            <ArrowRight className="ml-2 h-5 w-5 opacity-80 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Alternative Link */}
          <p className="text-sm text-neutral-500">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-primary-600 font-medium hover:text-primary-700 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-neutral-400 mt-6">
          This invitation link is unique to your email address.
        </p>
      </div>
    </div>
  );
};
