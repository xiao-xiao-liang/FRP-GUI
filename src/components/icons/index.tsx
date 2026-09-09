import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  title?: string;
}

export const RunIcon: React.FC<IconProps> = ({ className = 'w-3.5 h-3.5', size = 14, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path
      d="M12 6.13399C12.6667 6.51889 12.6667 7.48114 12 7.86604L3 13.0622C2.33333 13.4471 1.5 12.966 1.5 12.1962L1.5 1.80386C1.5 1.03406 2.33333 0.552935 3 0.937835L12 6.13399Z"
      fill="#F2FCF3"
      stroke="#208A3C"
    />
  </svg>
);

export const StopIcon: React.FC<IconProps> = ({ className = 'w-3.5 h-3.5', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="#FFF7F7" stroke="#DB3B4B" />
  </svg>
);

export const AddIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g fill="none" fillRule="evenodd">
    <rect width="2" height="10" x="7" y="3" fill="#6E6E6E"/>
    <rect width="2" height="10" x="7" y="3" fill="#6E6E6E" transform="rotate(90 8 8)"/>
  </g>
  </svg>
);

export const CheckedIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 12, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fill="#7F8B91" fillOpacity=".9" fillRule="evenodd" d="M5.27908728,11 L4.8977527,11 L1.01339746,4.39807621 L2.48564065,3.54807621 L5.2408588,8.32025404 L9.51339746,0.92 L10.9856406,1.77 L5.65058539,11 L5.27908728,11 Z"/>
  </svg>
);

export const CopyIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g fill="none" fillRule="evenodd">
    <path fill="#6E6E6E" d="M11,3 L4,3 L4,11 L2,11 L2,1 L11,1 L11,3 Z"/>
    <path fill="#6E6E6E" d="M5,4 L14,4 L14,14 L5,14 L5,4 Z M7,6 L7,7 L12,7 L12,6 L7,6 Z M7,10 L7,11 L12,11 L12,10 L7,10 Z M7,8 L7,9 L12,9 L12,8 L7,8 Z"/>
  </g>
  </svg>
);

export const DashboardIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path d="M8.33214 2.63203L13.3321 7.07539C13.4389 7.17028 13.5 7.3063 13.5 7.44914V13C13.5 13.2761 13.2761 13.5 13 13.5H10C9.72386 13.5 9.5 13.2761 9.5 13V11C9.5 10.1716 8.82843 9.5 8 9.5C7.17157 9.5 6.5 10.1716 6.5 11V13C6.5 13.2761 6.27614 13.5 6 13.5H3C2.72386 13.5 2.5 13.2761 2.5 13V7.44914C2.5 7.3063 2.56109 7.17028 2.66786 7.07539L7.66786 2.63203C7.85729 2.46369 8.14271 2.46369 8.33214 2.63203Z" fill="#EBECF0" stroke="#6C707E" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const DeleteIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fillRule="evenodd" clipRule="evenodd" d="M7 2H9C9.55228 2 10 2.44772 10 3H6C6 2.44772 6.44772 2 7 2ZM5 3C5 1.89543 5.89543 1 7 1H9C10.1046 1 11 1.89543 11 3H13C13.5523 3 14 3.44772 14 4V5V6H13V13C13 14.1046 12.1046 15 11 15H5C3.89543 15 3 14.1046 3 13V6H2V5V4C2 3.44772 2.44772 3 3 3H5ZM11 4H10H6H5H3V5H4H12H13V4H11ZM4 6H12V13C12 13.5523 11.5523 14 11 14H5C4.44772 14 4 13.5523 4 13V6ZM6.5 7C6.22386 7 6 7.22386 6 7.5V11.5C6 11.7761 6.22386 12 6.5 12C6.77614 12 7 11.7761 7 11.5V7.5C7 7.22386 6.77614 7 6.5 7ZM9 7.5C9 7.22386 9.22386 7 9.5 7C9.77614 7 10 7.22386 10 7.5V11.5C10 11.7761 9.77614 12 9.5 12C9.22386 12 9 11.7761 9 11.5V7.5Z" fill="#6C707E"/>
  </svg>
);

export const DownloadIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g fill="currentColor" fillRule="evenodd">
      <polygon points="9 7 12 7 8 11 4 7 7 7 7 2 9 2" transform="matrix(-1 0 0 1 16 0)"/>
      <rect width="12" height="2" x="2" y="12"/>
    </g>
  </svg>
);

export const EditIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fill="#6E6E6E" fillRule="evenodd" d="M12.299331,6.74049726 L9.29952586,3.74069209 L2,10.9993506 L2,13.9991557 L4.99980517,13.9991557 L12.299331,6.74049726 Z M14.7991687,4.24065962 C15.1202771,3.91952035 15.1202771,3.0618963 14.7991687,2.74075703 L13.2992661,1.24085445 C12.9781577,0.919715183 12.1204719,0.919715183 11.7993635,1.24085445 L10.2994609,2.74075703 L13.2992661,5.7405622 L14.7991687,4.24065962 Z"/>
  </svg>
);

export const ErrorIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 28, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <circle cx="14" cy="14" r="12" fill="#E55765"/>
<path d="M15 8C15 7.44772 14.5523 7 14 7C13.4477 7 13 7.44771 13 8L13 14C13 14.5523 13.4477 15 14 15C14.5523 15 15 14.5523 15 14L15 8Z" fill="white"/>
<path d="M14 21C14.8284 21 15.5 20.3284 15.5 19.5C15.5 18.6716 14.8284 18 14 18C13.1716 18 12.5 18.6716 12.5 19.5C12.5 20.3284 13.1716 21 14 21Z" fill="white"/>
  </svg>
);

export const ClearIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fill="#6E6E6E" d="M6,2 L6,1 L10,1 L10,2 L13,2 L13,4 L3,4 L3,2 L6,2 Z M4,12.7142858 L4,5 L12,5 L12,12.7142858 C12,13.4214286 11.4,14 10.6666667,14 L5.33333333,14 C4.6,14 4,13.4214286 4,12.7142858 Z"/>
  </svg>
);

export const VisibleLockIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = '1em', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    data-icon="VisibleLockOutlined"
    className={className}
    {...props}
  >
    <path
      d="m14.52 18.056 1.504 1.503a9.094 9.094 0 0 1-4.04.941c-3.995 0-7.479-2.52-10.453-7.562a1.864 1.864 0 0 1-.011-1.877c.783-1.36 1.609-2.536 2.477-3.528L5.304 8.84c-.79.87-1.559 1.917-2.304 3.147 2.76 4.454 5.748 6.513 8.985 6.513a7.43 7.43 0 0 0 2.535-.444Zm4.139-2.933c.797-.87 1.577-1.912 2.341-3.136C18.292 7.55 15.301 5.5 11.985 5.5c-.864 0-1.706.14-2.526.424l-1.51-1.51a9.241 9.241 0 0 1 4.035-.914c4.07 0 7.566 2.518 10.49 7.555a1.864 1.864 0 0 1-.01 1.887c-.797 1.342-1.63 2.505-2.498 3.489l-1.307-1.308Zm-6.218.853a4 4 0 0 1-4.417-4.417l4.417 4.417Zm3.535-3.536L11.56 8.024a4 4 0 0 1 4.417 4.417ZM2.21 2.21a.997.997 0 0 1 1.41-.005l18.388 18.389a.998.998 0 0 1-.004 1.41.998.998 0 0 1-1.41.004L2.205 3.619a.997.997 0 0 1 .005-1.41Z"
      fill="currentColor"
    />
  </svg>
);

export const HideIcon = VisibleLockIcon;

export const MobileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fillRule="evenodd" clipRule="evenodd" d="M10.355 12.5181C10.7986 12.3405 11.2721 12.2494 11.75 12.25C12.2419 12.25 12.7125 12.345 13.1425 12.5169L14.0188 11L14.56 11.3125L13.7025 12.7975C14.2518 13.1322 14.7056 13.6026 15.0204 14.1635C15.3352 14.7243 15.5004 15.3568 15.5 16H8C7.99962 15.3572 8.1646 14.7251 8.47906 14.1645C8.79352 13.6039 9.2469 13.1335 9.79563 12.7987L8.9375 11.3125L9.47875 11L10.355 12.5181ZM9.875 14.125V14.75H10.5V14.125H9.875ZM13 14.125V14.75H13.625V14.125H13Z" fill="#3DDC84"/>
<path fillRule="evenodd" clipRule="evenodd" d="M11.4161 1L12.7822 2.3V11.6125C12.4499 11.5388 12.1045 11.5 11.75 11.5C11.3783 11.5 11.0165 11.5427 10.6694 11.6235L9.78979 10.1H11.4161V2.3H4.5858V10.1H9.55885L8 11L8.85619 12.483C8.32633 12.8906 7.88491 13.4075 7.56565 14H4.5858L3.21973 12.7V2.3L4.5858 1H11.4161Z" fill="#9AA7B0" fillOpacity="0.8"/>
  </svg>
);

export const PauseIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g fill="#6E6E6E" fillRule="evenodd" transform="translate(4 2)">
    <rect width="3" height="11"/>
    <rect width="3" height="11" x="5"/>
  </g>
  </svg>
);

export const PluginIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fill="#9AA7B0" fillOpacity=".8" fillRule="evenodd" d="M3,5.9902 C3,6.3122 3.181,6.6082 3.467,6.7542 L3.779,6.9112 C4.022,7.0342 4.281,7.0212 4.5,6.9212 L4.5,5.5062 L4.5,4.4942 L4.5,3.0792 C4.281,2.9782 4.022,2.9662 3.779,3.0892 L3.467,3.2462 C3.181,3.3912 3,3.6872 3,4.0102 L3,4.4942 L3,5.5062 L3,5.9902 Z M6,14.0002 C4.111,14.0002 1.978,11.8222 2,10.0002 L2,8.0002 C2,6.5792 2.566,6.0002 3,6.0002 L3,4.0002 C1.9,4.0002 1,6.0792 1,8.0002 L1,10.0002 C1,12.7332 3.6,15.0002 6,15.0002 L11,15.0002 L11,14.0002 L6,14.0002 Z M7.137,1.0002 L11,1.0002 L11,8.5002 L11,9.0002 L9.5,9.0002 L7.137,9.0002 C5.957,9.0002 5,7.9242 5,6.5962 L5,3.4032 C5,2.0762 5.957,1.0002 7.137,1.0002 Z M11.5,8.0002 L15,8.0002 L15,7.0002 L11.5,7.0002 L11.5,8.0002 Z M11.5,3.0002 L15,3.0002 L15,2.0002 L11.5,2.0002 L11.5,3.0002 Z"/>
  </svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fill="#6E6E6E" fillRule="evenodd" d="M12.5747152,11.8852806 C11.4741474,13.1817355 9.83247882,14.0044386 7.99865879,14.0044386 C5.03907292,14.0044386 2.57997332,11.8615894 2.08820756,9.0427473 L3.94774327,9.10768372 C4.43372186,10.8898575 6.06393114,12.2000519 8.00015362,12.2000519 C9.30149237,12.2000519 10.4645985,11.6082097 11.2349873,10.6790094 L9.05000019,8.71167959 L14.0431479,8.44999981 L14.3048222,13.4430431 L12.5747152,11.8852806 Z M3.42785637,4.11741586 C4.52839138,2.82452748 6.16775464,2.00443857 7.99865879,2.00443857 C10.918604,2.00443857 13.3513802,4.09026967 13.8882946,6.8532307 L12.0226389,6.78808057 C11.5024872,5.05935553 9.89838095,3.8000774 8.00015362,3.8000774 C6.69867367,3.8000774 5.53545628,4.39204806 4.76506921,5.32142241 L6.95482203,7.29304326 L1.96167436,7.55472304 L1.70000005,2.56167973 L3.42785637,4.11741586 Z" transform="rotate(3 8.002 8.004)"/>
  </svg>
);

export const RemoteHostIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g fill="none" fillRule="evenodd">
    <polygon fill="#40B6E0" fillOpacity=".6" points="11 9 11 12 3 12 3 9"/>
    <polygon fill="#231F20" fillOpacity=".7" points="12 6.504 9 4 9 6 3 6 3 8 4 8 4 7 9 6.997 9 9"/>
    <path fill="#9AA7B0" fillOpacity=".8" d="M4,3 L4,5 L2,5 L2,13 L12,13 L12,11 L13,11 L13,14 L1,14 L1,3 L4,3 Z"/>
    <path fill="#9AA7B0" fillOpacity=".8" d="M13,10 L13,9 L14,9 L14,3 L6,3 L6,5 L5,5 L5,1 L15,1 L15,10 L13,10 Z"/>
  </g>
  </svg>
);

export const ResumeIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g fill="none" fillRule="evenodd">
    <polygon fill="#59A869" points="8 2 8.583 2 15 7.5 8.583 13 8 13"/>
    <rect width="3" height="11" x="3" y="2" fill="#59A869"/>
  </g>
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fill="#7F8B91" fillOpacity=".9" fillRule="evenodd" d="M11.038136,9.94904865 L13.9980971,12.9090097 L12.9374369,13.9696699 L9.98176525,11.0139983 C9.14925083,11.6334368 8.11743313,12 7,12 C4.23857625,12 2,9.76142375 2,7 C2,4.23857625 4.23857625,2 7,2 C9.76142375,2 12,4.23857625 12,7 C12,8.1028408 11.642948,9.12228765 11.038136,9.94904865 Z M7,11 C9.209139,11 11,9.209139 11,7 C11,4.790861 9.209139,3 7,3 C4.790861,3 3,4.790861 3,7 C3,9.209139 4.790861,11 7,11 Z"/>
  </svg>
);

export const ServicesIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 13, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 13 13"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path fill="#6E6E6E" fillRule="evenodd" d="M13,6.5 L9.75,12 L3.25,12 L1.77635684e-15,6.5 L3.25,1 L9.75,1 L13,6.5 Z M4.5,3.2 L4.5,9.8 L9.75388745,6.5 L4.5,3.2 Z"/>
  </svg>
);

export const ShieldIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 12, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path d="M6 0L1 1V6.7C1.176 8.682 2.84267 10.4487 6 12C9.156 10.4493 10.8227 8.68267 11 6.7V1L6 0ZM9.6 6.631C9.454 7.948 8.244 9.224 6 10.431C3.756 9.231 2.546 7.951 2.4 6.631V2.148L6 1.428L9.6 2.148V6.631Z" fill="#7F8B91" fillOpacity="0.9"/>
  <path fillRule="evenodd" clipRule="evenodd" d="M7.96973 3.46967L9.03039 4.53033L5.50006 8.06066L3.46973 6.03033L4.53039 4.96967L5.50006 5.93934L7.96973 3.46967Z" fill="#7F8B91" fillOpacity="0.9"/>
  </svg>
);

export const VisibleIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = '1em', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    data-icon="VisibleOutlined"
    className={className}
    {...props}
  >
    <path
      d="M11.985 18.5c3.238 0 6.236-2.06 9.015-6.513C18.292 7.55 15.3 5.5 11.985 5.5 8.67 5.5 5.689 7.549 3 11.987c2.76 4.454 5.748 6.513 8.985 6.513ZM1.502 12.89a1.782 1.782 0 0 1 .023-1.838C4.428 6.017 7.915 3.5 11.984 3.5c4.086 0 7.594 2.538 10.523 7.614l.028.048c.296.519.294 1.16-.01 1.675-3.006 5.108-6.52 7.663-10.541 7.663-4.007 0-7.501-2.537-10.482-7.61ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
      fill="currentColor"
    />
  </svg>
);

export const ShowIcon = VisibleIcon;

export const TerminalIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="#6C707E"/>
<path d="M4.4799 9.4799L6.4598 7.5L4.4799 5.5201" stroke="#6C707E" strokeLinecap="round"/>
<path d="M7.5 10.5L10.5 10.5" stroke="#6C707E" strokeLinecap="round"/>
  </svg>
);

export const WarningIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 28, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path d="M12.72 2.74194C13.2889 1.75269 14.7111 1.75269 15.28 2.74194L26.7998 22.7742C27.3687 23.7634 26.6576 25 25.5198 25H2.4802C1.34244 25 0.631339 23.7634 1.20022 22.7742L12.72 2.74194Z" fill="#FFAF0F"/>
<path d="M15 9C15 8.44772 14.5523 8 14 8C13.4477 8 13 8.44771 13 9L13 15C13 15.5523 13.4477 16 14 16C14.5523 16 15 15.5523 15 15L15 9Z" fill="white"/>
<path d="M14 22C14.8284 22 15.5 21.3284 15.5 20.5C15.5 19.6716 14.8284 19 14 19C13.1716 19 12.5 19.6716 12.5 20.5C12.5 21.3284 13.1716 22 14 22Z" fill="white"/>
  </svg>
);

export const WebIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size = 14, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g transform="matrix(.857 0 0 .857 .143 .143)" stroke="#818594">
    <circle cx="8" cy="8" r="6.5"/>
    <path d="m10.5 8c0 1.88-0.328 3.56-0.838 4.75-0.256 0.596-0.547 1.05-0.845 1.34-0.296 0.292-0.571 0.406-0.817 0.406s-0.52-0.114-0.817-0.406c-0.298-0.294-0.59-0.745-0.845-1.34-0.51-1.19-0.838-2.87-0.838-4.75s0.328-3.56 0.838-4.75c0.256-0.596 0.547-1.05 0.845-1.34 0.296-0.292 0.571-0.406 0.817-0.406s0.52 0.114 0.817 0.406c0.298 0.294 0.59 0.745 0.845 1.34 0.51 1.19 0.838 2.87 0.838 4.75z"/>
    <path d="m14.2 5.5h-12.4"/>
    <path d="m14.2 10.5h-12.4"/>
  </g>
  </svg>
);
