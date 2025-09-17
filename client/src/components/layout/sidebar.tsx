import React from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Home, 
  FileText, 
  LayoutTemplate, 
  Settings,
  LogOut
} from 'lucide-react';
import UserAvatar from './user-avatar';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isMobile = false,
  onClose
}) => {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const navItems = [
    {
      name: 'Dashboard',
      path: '/',
      icon: Home,
    },
    {
      name: 'Documents',
      path: '/documents',
      icon: FileText,
    },
    {
      name: 'Templates',
      path: '/templates',
      icon: LayoutTemplate,
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: Settings,
    },
  ];

  const isActive = (path: string) => {
    return location === path;
  };

  const handleLinkClick = () => {
    if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <div className="flex flex-col w-64 bg-gray-800 border-r border-gray-200 h-full">
      <div className="flex items-center justify-center h-16 bg-gray-900">
        <h1 className="text-xl font-semibold text-white">DocCompile</h1>
      </div>
      <div className="flex flex-col flex-grow overflow-y-auto">
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              onClick={handleLinkClick}
              className={`flex items-center px-2 py-2 text-base font-medium rounded-md group ${
                isActive(item.path)
                  ? 'text-white bg-gray-700'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <item.icon className={`w-6 h-6 mr-3 ${
                isActive(item.path) ? 'text-gray-300' : 'text-gray-400'
              }`} />
              {item.name}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex flex-col p-4 bg-gray-700 space-y-3">
        <div className="flex items-center">
          <UserAvatar 
            name={user?.username || "User"}
            email={user?.email || ""}
            showInfo
          />
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full flex items-center justify-center text-gray-300 hover:text-white"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? (
            <span>Logging out...</span>
          ) : (
            <>
              <LogOut className="w-4 h-4 mr-2" />
              <span>Logout</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
