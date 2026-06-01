import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

interface UserAvatarProps {
  name: string;
  email?: string;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showInfo?: boolean;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  email,
  imageUrl,
  size = 'md',
  className = '',
  showInfo = false,
}) => {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  return (
    <div className={`flex items-center ${className}`}>
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={imageUrl} alt={name} />
        <AvatarFallback className="bg-gray-700 text-white">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      
      {showInfo && (
        <div className="ml-3">
          <p className="text-sm font-medium text-white">{name}</p>
          {email && <p className="text-xs font-medium text-gray-300">{email}</p>}
        </div>
      )}
    </div>
  );
};

export default UserAvatar;
