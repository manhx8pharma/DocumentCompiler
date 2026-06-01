import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from './sidebar';
import UserAvatar from './user-avatar';

const MobileSidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const closeSidebar = () => {
    setIsOpen(false);
  };

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-gray-800 text-white">
        <div className="flex items-center">
          <button
            type="button"
            className="text-gray-300 hover:text-white"
            onClick={toggleSidebar}
            aria-label="Open main menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="ml-3 text-xl font-semibold">DocCompile</h1>
        </div>
        <div>
          <UserAvatar name="John Smith" size="sm" />
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75" 
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 flex flex-col z-50 w-64 bg-gray-800 transform transition-transform ease-in-out duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:hidden`}>
        <div className="absolute top-0 right-0 -mr-12 pt-2">
          <button
            type="button"
            className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            onClick={closeSidebar}
          >
            <span className="sr-only">Close sidebar</span>
            <X className="h-6 w-6 text-white" />
          </button>
        </div>
        <Sidebar isMobile onClose={closeSidebar} />
      </div>
    </>
  );
};

export default MobileSidebar;
