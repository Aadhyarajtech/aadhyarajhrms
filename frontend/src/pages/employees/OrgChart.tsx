import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  ChevronRight,
  ChevronDown,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Filter,
  Bot,
  Sparkles,
  X,
  Send,
  RotateCcw,
  Users,
  Crown,
  ExternalLink,
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Maximize,
  Target,
  ArrowRight
} from 'lucide-react';

// --- Types ---
export interface Employee {
  id: string;
  code: string;
  name: string;
  designation: string;
  department: string;
  email: string;
  phone: string;
  location: string;
  joinedDate: string;
  gender: string;
  maritalStatus: string;
  dob: string;
  type: string;
  status: string;
  reportsTo: string | null;
  directReportsCount: number;
}

export interface TreeNode extends Employee {
  children: TreeNode[];
}

interface OrgChartProps {
  onViewProfile?: (employee: Employee) => void;
}

interface ChatMessage {
  id: string;
  text?: string;
  isAi: boolean;
  cards?: Employee[];
  stats?: { title: string; count: number; detail: string };
}

// --- Dataset Matched to Screenshots ---
export const EMPLOYEES_DATA: Employee[] = [
  {
    id: 'emp_001',
    code: 'EMP001',
    name: 'Adithya Nuthakki',
    designation: 'Customer Success Lead',
    department: 'Customer Success',
    email: 'admin@aadhyaraj.com',
    phone: '9000000001',
    location: 'Hyderabad',
    joinedDate: '01 Jan 2020',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '15 Aug 1988',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: null,
    directReportsCount: 4
  },
  {
    id: 'emp_002',
    code: 'EMP002',
    name: 'Gangadhar Yedla',
    designation: 'HR Manager',
    department: 'Human Resources',
    email: 'manager.demo@aadhyaraj.com',
    phone: '9000000002',
    location: 'Hyderabad',
    joinedDate: '10 Mar 2020',
    gender: 'MALE',
    maritalStatus: 'MARRIED',
    dob: '10 Nov 1986',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Adithya Nuthakki',
    directReportsCount: 2
  },
  {
    id: 'emp_003',
    code: 'EMP003',
    name: 'Kaushal Chowdary',
    designation: 'Senior Product Designer',
    department: 'Finance',
    email: 'kaushal.chowdary@aadhyaraj.com',
    phone: '9000000003',
    location: 'Hyderabad',
    joinedDate: '10 Aug 2021',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '12 Dec 1992',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Adithya Nuthakki',
    directReportsCount: 3
  },
  {
    id: 'emp_004',
    code: 'EMP004',
    name: 'Karthik Gummadi',
    designation: 'Talent Acquisition Specialist',
    department: 'Human Resources',
    email: 'karthik.gumadi@aadhyaraj.com',
    phone: '9000000004',
    location: 'Hyderabad',
    joinedDate: '01 Nov 2021',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '08 Feb 1993',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Adithya Nuthakki',
    directReportsCount: 2
  },
  {
    id: 'emp_005',
    code: 'EMP005',
    name: 'Anshu Sharma',
    designation: 'HR Manager',
    department: 'Operations',
    email: 'anshu.sharma@aadhyaraj.com',
    phone: '9000000003',
    location: 'Hyderabad',
    joinedDate: '15 May 2021',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '30 Oct 1991',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Gangadhar Yedla',
    directReportsCount: 0
  },
  {
    id: 'emp_006',
    code: 'EMP006',
    name: 'Sreevidya Talasila',
    designation: 'HR Associate',
    department: 'Human Resources',
    email: 'finance.demo@aadhyaraj.com',
    phone: '9000000006',
    location: 'Hyderabad',
    joinedDate: '01 Sep 2020',
    gender: 'FEMALE',
    maritalStatus: 'MARRIED',
    dob: '05 Apr 1989',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Gangadhar Yedla',
    directReportsCount: 9
  },
  {
    id: 'emp_007',
    code: 'EMP007',
    name: 'Kavya Rachupalli',
    designation: 'Operations Manager',
    department: 'Operations',
    email: 'it.support.demo@aadhyaraj.com',
    phone: '9000000007',
    location: 'Hyderabad',
    joinedDate: '15 Jan 2022',
    gender: 'FEMALE',
    maritalStatus: 'MARRIED',
    dob: '14 Jun 1991',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Kaushal Chowdary',
    directReportsCount: 0
  },
  {
    id: 'emp_008',
    code: 'EMP008',
    name: 'Sreeshanth Dyapa',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'sreeshanth.dyapa@aadhyaraj.com',
    phone: '9000000008',
    location: 'Hyderabad',
    joinedDate: '01 Mar 2022',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '20 Sep 1992',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Kaushal Chowdary',
    directReportsCount: 0
  },
  {
    id: 'emp_009',
    code: 'EMP009',
    name: 'Geetha Balachandran',
    designation: 'Director of Design',
    department: 'Product',
    email: 'hr.admin@aadhyaraj.com',
    phone: '9000000001',
    location: 'Hyderabad',
    joinedDate: '10 Mar 2020',
    gender: 'FEMALE',
    maritalStatus: 'MARRIED',
    dob: '22 May 1985',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Kaushal Chowdary',
    directReportsCount: 0
  },
  {
    id: 'emp_010',
    code: 'EMP0010',
    name: 'Sirisha Desina',
    designation: 'Design Manager',
    department: 'Marketing',
    email: 'sirisha.desina@aadhyaraj.com',
    phone: '9000000010',
    location: 'Hyderabad',
    joinedDate: '12 Jan 2021',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '18 Jul 1992',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Karthik Gummadi',
    directReportsCount: 0
  },
  {
    id: 'emp_011',
    code: 'EMP0011',
    name: 'Meghana Sahithi',
    designation: 'HR Associate',
    department: 'Operations',
    email: 'recruiter.demo@aadhyaraj.com',
    phone: '9000000002',
    location: 'Hyderabad',
    joinedDate: '01 Mar 2021',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '25 Aug 1993',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Karthik Gummadi',
    directReportsCount: 0
  },
  {
    id: 'emp_012',
    code: 'EMP0012',
    name: 'Damodar Dosa',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'damodar.dosa@aadhyaraj.com',
    phone: '9000000012',
    location: 'Hyderabad',
    joinedDate: '01 Dec 2022',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '10 May 1994',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 0
  },
  {
    id: 'emp_013',
    code: 'EMP0013',
    name: 'Dileep Yalla',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'dileep.yalla@aadhyaraj.com',
    phone: '9000000013',
    location: 'Hyderabad',
    joinedDate: '15 Jan 2023',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '14 Jul 1993',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 0
  },
  {
    id: 'emp_014',
    code: 'EMP0014',
    name: 'Abhiram Bolloju',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'abhiram.bolloju@aadhyaraj.com',
    phone: '9000000014',
    location: 'Hyderabad',
    joinedDate: '01 Mar 2023',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '02 Feb 1995',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 0
  },
  {
    id: 'emp_015',
    code: 'EMP0015',
    name: 'Lalit Choudhari',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'lalit.choudhari@aadhyaraj.com',
    phone: '9000000015',
    location: 'Hyderabad',
    joinedDate: '15 Apr 2023',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '19 Aug 1993',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 0
  },
  {
    id: 'emp_016',
    code: 'EMP0016',
    name: 'Naga Chandana Sakala',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'nagachandana.sakala@aadhyaraj.com',
    phone: '9000000016',
    location: 'Hyderabad',
    joinedDate: '01 Jun 2023',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '28 Dec 1995',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 0
  },
  {
    id: 'emp_017',
    code: 'EMP0017',
    name: 'Himayanth Deevaguntla',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'himavanth.deevaguntla@aadhyaraj.com',
    phone: '9000000017',
    location: 'Hyderabad',
    joinedDate: '15 Jul 2023',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '11 Oct 1994',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 0
  },
  {
    id: 'emp_018',
    code: 'EMP0018',
    name: 'Jyothika Rachupalli',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'jyothika.rachupalli@aadhyaraj.com',
    phone: '9000000018',
    location: 'Hyderabad',
    joinedDate: '01 Sep 2023',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '04 Apr 1996',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 0
  },
  {
    id: 'emp_019',
    code: 'EMP0019',
    name: 'Anusha Nookanaboina',
    designation: 'Design Manager',
    department: 'Design',
    email: 'employee.demo@aadhyaraj.com',
    phone: '9000000019',
    location: 'Hyderabad',
    joinedDate: '10 Jun 2022',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '05 Nov 1994',
    type: 'FULL TIME',
    status: 'NOTICE PERIOD',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 0
  },
  {
    id: 'emp_020',
    code: 'EMP0020',
    name: 'Yamini Meka',
    designation: 'Talent Acquisition Specialist',
    department: 'Human Resources',
    email: 'yamini.meka@aadhyaraj.com',
    phone: '9000000020',
    location: 'Hyderabad',
    joinedDate: '15 Aug 2022',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '18 Jan 1995',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Sreevidya Talasila',
    directReportsCount: 2
  },
  {
    id: 'emp_021',
    code: 'EMP0021',
    name: 'Meghana Kondapalli',
    designation: 'HR Associate',
    department: 'Human Resources',
    email: 'meghana.kondapalli@aadhyaraj.com',
    phone: '9000000021',
    location: 'Hyderabad',
    joinedDate: '01 Oct 2022',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '22 Mar 1995',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Yamini Meka',
    directReportsCount: 0
  },
  {
    id: 'emp_022',
    code: 'EMP0022',
    name: 'Vyshnavi Boddu',
    designation: 'UX Researcher',
    department: 'Design',
    email: 'vyshnavi.boddu@aadhyaraj.com',
    phone: '9000000022',
    location: 'Hyderabad',
    joinedDate: '15 Nov 2023',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '16 Jun 1996',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Yamini Meka',
    directReportsCount: 0
  },
  {
    id: 'emp_023',
    code: 'ART-2026-0023',
    name: 'nagachandana.sakala User',
    designation: 'VP of Engineering',
    department: 'Engineering',
    email: 'nagachandana.sakala@aadhyaraj.com',
    phone: '9000000023',
    location: 'Hyderabad',
    joinedDate: '01 Jan 2024',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    dob: '10 Feb 1990',
    type: 'FULL TIME',
    status: 'ACTIVE',
    reportsTo: 'Adithya Nuthakki',
    directReportsCount: 2
  },
  {
    id: 'emp_024',
    code: 'ART-2026-0024',
    name: 'Jake Ryan',
    designation: 'Software Engineer',
    department: 'Engineering',
    email: 'jake@su.edu',
    phone: '123-456-7890',
    location: 'Remote',
    joinedDate: '15 Feb 2024',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
    dob: '20 Jul 1995',
    type: 'FULL TIME',
    status: 'ONBOARDING',
    reportsTo: 'nagachandana.sakala User',
    directReportsCount: 0
  },
  {
    id: 'emp_025',
    code: 'ART-2026-0025',
    name: 'ramesh kumar',
    designation: 'Director of Engineering',
    department: 'Engineering',
    email: 'rameshkumar1234@gmail.com',
    phone: '7854215513',
    location: 'Hyderabad',
    joinedDate: '01 Mar 2024',
    gender: 'MALE',
    maritalStatus: 'MARRIED',
    dob: '12 May 1987',
    type: 'FULL TIME',
    status: 'ONBOARDING',
    reportsTo: 'nagachandana.sakala User',
    directReportsCount: 0
  }
];

const AUTOMATED_QUESTIONS = [
  "Who is the Customer Success Lead?",
  "Show Engineering Roles",
  "Show HR Hierarchy",
  "Show Design Team",
  "What is the total headcount?"
];

const INITIAL_CHAT_MESSAGE: ChatMessage = {
  id: 'msg_init',
  text: "Hello! Welcome to Aadhyaraj Technologies AI assistant. How can I assist you with team information today?",
  isAi: true
};

export default function OrgChart({ onViewProfile }: OrgChartProps) {
  // --- States ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [fullProfileEmployee, setFullProfileEmployee] = useState<Employee | null>(null);

  // Zoom level state (Default 0.85)
  const [zoomLevel, setZoomLevel] = useState<number>(0.85);

  // Expand all parent nodes by default
  const [expandedNodes, setExpandedNodes] = useState<{ [key: string]: boolean }>({
    'emp_001': true,
    'emp_002': true,
    'emp_003': true,
    'emp_004': true,
    'emp_006': true,
    'emp_020': true,
    'emp_023': true
  });

  // Chatbot State
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([INITIAL_CHAT_MESSAGE]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Focus node highlight effect
  const [focusedEmpId, setFocusedEmpId] = useState<string | null>(null);

  // Refs
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const sideDrawerRef = useRef<HTMLDivElement>(null);

  // Helpers
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const toggleExpand = (id: string) => setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 1.3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.45));
  const handleResetZoom = () => setZoomLevel(0.85);

  // --- Smooth Pan/Scroll to Target Employee ---
  const autoFocusEmployeeNode = (empId: string) => {
    // 1. Expand all ancestors
    const emp = EMPLOYEES_DATA.find(e => e.id === empId || e.code === empId);
    if (!emp) return;

    const newExpanded = { ...expandedNodes };
    let curr: Employee | undefined = emp;
    while (curr && curr.reportsTo) {
      const parent = EMPLOYEES_DATA.find(e => e.name === curr?.reportsTo || e.id === curr?.reportsTo);
      if (parent) {
        newExpanded[parent.id] = true;
        curr = parent;
      } else {
        break;
      }
    }
    setExpandedNodes(newExpanded);
    setFocusedEmpId(emp.id);

    // 2. Smoothly scroll container to center target node
    setTimeout(() => {
      const el = document.getElementById(`node-${emp.id}`);
      if (el && treeContainerRef.current) {
        const container = treeContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        const scrollLeft = container.scrollLeft + (elRect.left - containerRect.left) - containerRect.width / 2 + elRect.width / 2;
        const scrollTop = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height / 2 + elRect.height / 2;

        container.scrollTo({
          left: Math.max(0, scrollLeft),
          top: Math.max(0, scrollTop),
          behavior: 'smooth'
        });
      }
    }, 150);
  };

  useEffect(() => {
    if (selectedEmployee && sideDrawerRef.current) {
      sideDrawerRef.current.scrollTop = 0;
    }
  }, [selectedEmployee]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  // Search filter expand & focus logic
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      setFocusedEmpId(null);
      return;
    }

    const matches = EMPLOYEES_DATA.filter(
      emp => emp.name.toLowerCase().includes(term) || emp.designation.toLowerCase().includes(term) || emp.code.toLowerCase().includes(term)
    );

    if (matches.length > 0) {
      autoFocusEmployeeNode(matches[0].id);
    }
  }, [searchTerm]);

  const handleResetSession = () => {
    setChatMessages([INITIAL_CHAT_MESSAGE]);
    setInputMessage('');
    setIsTyping(false);
  };

  // --- ADVANCED AI CHATBOT ENGINE ---
  const handleSendMessage = (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const queryText = (customQuery || inputMessage).trim();
    if (!queryText) return;

    const userMsgId = `usr_${Date.now()}`;
    setChatMessages(prev => [...prev, { id: userMsgId, text: queryText, isAi: false }]);
    if (!customQuery) setInputMessage('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const q = queryText.toLowerCase();
      const aiMsgId = `ai_${Date.now()}`;

      // Query Intent 1: Customer Success Lead / Adithya
      if (q.includes('customer success') || q.includes('lead') || q.includes('adithya')) {
        const lead = EMPLOYEES_DATA.find(e => e.id === 'emp_001')!;
        setChatMessages(prev => [
          ...prev,
          {
            id: aiMsgId,
            isAi: true,
            text: `Adithya Nuthakki is the Customer Success Lead (${lead.code}). He oversees organization operations with 4 direct executive reports.`,
            cards: [lead]
          }
        ]);
      }
      // Query Intent 2: Engineering Roles
      else if (q.includes('engineering')) {
        const engTeam = EMPLOYEES_DATA.filter(e => e.department === 'Engineering');
        setChatMessages(prev => [
          ...prev,
          {
            id: aiMsgId,
            isAi: true,
            text: `Found ${engTeam.length} Engineering Team Members led by nagachandana.sakala User (VP of Engineering):`,
            cards: engTeam
          }
        ]);
      }
      // Query Intent 3: HR Hierarchy
      else if (q.includes('hr') || q.includes('human resources') || q.includes('hierarchy')) {
        const hrTeam = EMPLOYEES_DATA.filter(e => e.department === 'Human Resources');
        setChatMessages(prev => [
          ...prev,
          {
            id: aiMsgId,
            isAi: true,
            text: `Human Resources Department Hierarchy (${hrTeam.length} members):`,
            cards: hrTeam
          }
        ]);
      }
      // Query Intent 4: Design Team
      else if (q.includes('design')) {
        const designTeam = EMPLOYEES_DATA.filter(e => e.department === 'Design' || e.designation.toLowerCase().includes('design'));
        setChatMessages(prev => [
          ...prev,
          {
            id: aiMsgId,
            isAi: true,
            text: `Design Team Directory (${designTeam.length} members):`,
            cards: designTeam
          }
        ]);
      }
      // Query Intent 5: Headcount
      else if (q.includes('headcount') || q.includes('total') || q.includes('count')) {
        setChatMessages(prev => [
          ...prev,
          {
            id: aiMsgId,
            isAi: true,
            text: `Aadhyaraj Technologies active headcount report:`,
            stats: {
              title: "Total Headcount",
              count: EMPLOYEES_DATA.length,
              detail: "23 Active Full-Time Members & 2 Onboarding"
            }
          }
        ]);
      }
      // Specific Employee Name Search in Chat
      else {
        const matched = EMPLOYEES_DATA.filter(e => e.name.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q));
        if (matched.length > 0) {
          setChatMessages(prev => [
            ...prev,
            {
              id: aiMsgId,
              isAi: true,
              text: `I found ${matched.length} team member(s) matching your query:`,
              cards: matched
            }
          ]);
        } else {
          setChatMessages(prev => [
            ...prev,
            {
              id: aiMsgId,
              isAi: true,
              text: "I couldn't find a direct match. Try asking about HR Hierarchy, Engineering Roles, Design Team, or Headcount."
            }
          ]);
        }
      }
    }, 500);
  };

  const handleOpenFullProfile = (emp: Employee) => {
    if (onViewProfile) {
      onViewProfile(emp);
    }
    setFullProfileEmployee(emp);
    setSelectedEmployee(null);
  };

  // --- Tree Construction Algorithm ---
  const treeData = useMemo(() => {
    const nodeMap: { [id: string]: TreeNode } = {};
    const nameToIdMap: { [name: string]: string } = {};
    const rootNodes: TreeNode[] = [];

    const filtered = EMPLOYEES_DATA.filter(emp => {
      if (selectedDept !== 'ALL' && emp.department !== selectedDept && emp.reportsTo !== null) {
        return false;
      }
      return true;
    });

    filtered.forEach(emp => {
      nodeMap[emp.id] = { ...emp, children: [] };
      nameToIdMap[emp.name] = emp.id;
    });

    filtered.forEach(emp => {
      if (emp.reportsTo) {
        const parentId = nodeMap[emp.reportsTo] ? emp.reportsTo : nameToIdMap[emp.reportsTo];
        if (parentId && nodeMap[parentId]) {
          nodeMap[parentId].children.push(nodeMap[emp.id]);
        } else {
          rootNodes.push(nodeMap[emp.id]);
        }
      } else {
        rootNodes.push(nodeMap[emp.id]);
      }
    });

    return rootNodes;
  }, [selectedDept]);

  // --- Render Individual Tree Node ---
  const renderNode = (node: TreeNode) => {
    const isExpanded = expandedNodes[node.id] ?? true;
    const hasChildren = node.children.length > 0;
    const isFounderNode = node.id === 'emp_001' || node.reportsTo === null;
    const isFocused = focusedEmpId === node.id;
    const isMatchesSearch = searchTerm.trim() !== '' && (
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.designation.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div key={node.id} id={`node-${node.id}`} className="flex items-center my-1.5 relative">
        <div
          onClick={() => setSelectedEmployee(node)}
          className={`group flex items-center gap-3 bg-white px-3 py-2.5 rounded-xl border transition-all duration-300 cursor-pointer shadow-xs ${
            isFocused || isMatchesSearch
              ? 'ring-4 ring-purple-500/80 border-purple-600 bg-purple-50 scale-105 shadow-lg z-20'
              : isFounderNode
              ? 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
              : 'border-gray-200 hover:border-purple-300 hover:shadow-sm'
          }`}
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-inner shrink-0 ${
            isFounderNode 
              ? 'bg-gradient-to-br from-amber-500 to-orange-600' 
              : 'bg-gradient-to-br from-purple-500 to-indigo-600'
          }`}>
            {isFounderNode ? <Crown size={16} className="text-amber-100" /> : getInitials(node.name)}
          </div>

          <div className="min-w-[170px]">
            <div className="flex items-center gap-1">
              <h4 className={`text-xs font-bold transition-colors ${isMatchesSearch || isFocused ? 'text-purple-950' : 'text-gray-900 group-hover:text-purple-600'}`}>
                {node.name}
              </h4>
            </div>
            <p className="text-[11px] text-gray-500 font-medium leading-tight">{node.designation}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-50 text-purple-700 font-semibold border border-purple-100">
                {node.department}
              </span>
              <span className="text-[9px] text-gray-400 font-mono">{node.code}</span>
            </div>
          </div>

          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-6 pl-4 border-l-2 border-purple-200 flex flex-col gap-1">
            {node.children.map(child => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 relative">
      <div className="mx-auto space-y-4 max-w-7xl">

        {/* --- Header Toolbar --- */}
        <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                <Users size={20} />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Aadhyaraj Organization Hierarchy</h1>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Full reporting structure across team members
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search member..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 w-48"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-xl">
              <Filter size={14} className="text-gray-400" />
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-transparent text-xs text-gray-700 font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Departments</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Engineering">Engineering</option>
                <option value="Operations">Operations</option>
                <option value="Design">Design</option>
                <option value="Product">Product</option>
                <option value="Marketing">Marketing</option>
                <option value="Customer Success">Customer Success</option>
              </select>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button 
                onClick={handleZoomOut} 
                title="Zoom Out" 
                className="p-1 hover:bg-white rounded-lg text-gray-600 transition-colors"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-xs font-semibold text-gray-600 px-1.5">{Math.round(zoomLevel * 100)}%</span>
              <button 
                onClick={handleZoomIn} 
                title="Zoom In" 
                className="p-1 hover:bg-white rounded-lg text-gray-600 transition-colors"
              >
                <ZoomIn size={16} />
              </button>
              <button 
                onClick={handleResetZoom} 
                title="Fit to Screen" 
                className="p-1 hover:bg-white rounded-lg text-gray-600 transition-colors border-l border-gray-200 ml-0.5"
              >
                <Maximize size={14} />
              </button>
            </div>

            {/* Chatbot Button */}
            <button
              onClick={() => setIsChatbotOpen(!isChatbotOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-xs ${
                isChatbotOpen
                  ? 'bg-purple-700 text-white ring-2 ring-purple-300'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 text-white'
              }`}
            >
              <Bot size={16} />
              <span>Chatbot</span>
              <Sparkles size={12} className="text-purple-200 animate-pulse" />
            </button>
          </div>
        </div>

        {/* --- Main Workspace Canvas --- */}
        <div className="flex gap-4 relative items-start">
          
          {/* Org Tree Section */}
          <div 
            ref={treeContainerRef}
            className="flex-1 bg-white p-4 rounded-2xl shadow-xs border border-gray-200/80 overflow-auto max-h-[80vh] scroll-smooth"
          >
            <div 
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }} 
              className="transition-transform duration-150 inline-block min-w-full"
            >
              {treeData.length > 0 ? (
                treeData.map(node => renderNode(node))
              ) : (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-sm font-medium">No team members match the selected filter.</p>
                </div>
              )}
            </div>
          </div>

          {/* --- Chatbot Slide-Over Drawer --- */}
          {isChatbotOpen && (
            <div className="w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col h-[620px] transition-all duration-300 sticky top-4 shrink-0 z-30 overflow-hidden">
              
              {/* Drawer Header */}
              <div className="p-3.5 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between shrink-0 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/20 rounded-xl backdrop-blur-md">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs">Aadhyaraj HR AI Assistant</h3>
                    <p className="text-[10px] text-purple-200">Interactive Intelligence</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={handleResetSession} title="Reset Chat" className="p-1 hover:bg-white/20 rounded-lg text-purple-100 hover:text-white transition-colors">
                    <RotateCcw size={14} />
                  </button>
                  <button onClick={() => setIsChatbotOpen(false)} className="p-1 hover:bg-white/20 rounded-lg text-purple-100 hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Text Input Box */}
              <form onSubmit={handleSendMessage} className="p-2.5 bg-gray-50 border-b border-gray-200 flex gap-2 shrink-0">
                <input
                  type="text"
                  placeholder="Ask about team members, roles..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-xs"
                />
                <button type="submit" className="p-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors shadow-xs">
                  <Send size={14} />
                </button>
              </form>

              {/* Automated Question Chips */}
              <div className="p-2.5 bg-purple-50/50 border-b border-purple-100 flex flex-wrap gap-1 shrink-0 max-h-36 overflow-y-auto">
                <p className="w-full text-[9px] text-purple-600 font-bold uppercase tracking-wider mb-0.5">Automated Queries</p>
                {AUTOMATED_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(undefined, q)}
                    className="px-2.5 py-1 bg-white border border-purple-200 text-purple-800 text-[10px] font-semibold rounded-lg hover:bg-purple-600 hover:text-white transition-all text-left shadow-2xs"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Messages Display */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-gray-50/30">
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.isAi ? 'items-start' : 'items-end'}`}>
                    
                    {/* Message Bubble */}
                    <div className="flex gap-2 max-w-[92%]">
                      {msg.isAi && (
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 shadow-xs">
                          AI
                        </div>
                      )}
                      
                      <div
                        className={`p-3 rounded-2xl text-xs leading-relaxed ${
                          msg.isAi
                            ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-xs'
                            : 'bg-purple-600 text-white rounded-tr-none font-medium shadow-xs'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>

                    {/* Stats Card Response */}
                    {msg.stats && (
                      <div className="ml-8 mt-2 p-3 bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-2xl shadow-md border border-purple-700 w-[88%]">
                        <p className="text-[10px] text-purple-300 font-semibold uppercase">{msg.stats.title}</p>
                        <h2 className="text-2xl font-black text-amber-300 mt-0.5">{msg.stats.count} Members</h2>
                        <p className="text-[11px] text-purple-100 mt-1">{msg.stats.detail}</p>
                      </div>
                    )}

                    {/* Employee Cards Responses */}
                    {msg.cards && msg.cards.length > 0 && (
                      <div className="ml-8 mt-2 space-y-2 w-[88%]">
                        {msg.cards.map(card => (
                          <div
                            key={card.id}
                            className="p-2.5 bg-white border border-purple-100 rounded-xl shadow-2xs hover:border-purple-400 transition-all flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                                  {getInitials(card.name)}
                                </div>
                                <div>
                                  <h5 className="text-xs font-bold text-gray-900">{card.name}</h5>
                                  <p className="text-[10px] text-gray-500">{card.designation}</p>
                                </div>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 bg-purple-50 text-purple-700 font-bold rounded">
                                {card.code}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                              <span>Dept: <strong className="text-gray-700">{card.department}</strong></span>
                              <span>Reports: <strong className="text-purple-700">{card.directReportsCount}</strong></span>
                            </div>

                            <div className="flex items-center gap-1 mt-0.5">
                              <button
                                onClick={() => autoFocusEmployeeNode(card.id)}
                                className="flex-1 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                              >
                                <Target size={10} />
                                <span>Locate in Org Chart</span>
                              </button>
                              <button
                                onClick={() => handleOpenFullProfile(card)}
                                className="p-1 text-gray-400 hover:text-purple-600 rounded-lg hover:bg-gray-100 transition-colors"
                                title="Full Profile"
                              >
                                <ArrowRight size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                ))}

                {/* Typing Indicator */}
                {isTyping && (
                  <div className="flex gap-2 items-center text-xs text-purple-600 font-medium">
                    <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center text-[10px] font-bold">
                      AI
                    </div>
                    <div className="p-2.5 bg-white border border-gray-200 rounded-2xl rounded-tl-none flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>
            </div>
          )}

        </div>

        {/* --- VIEWPORT SIDE DRAWER --- */}
        {selectedEmployee && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[9999] flex justify-end">
            <div 
              ref={sideDrawerRef}
              className="w-full max-w-md bg-white h-screen shadow-2xl p-6 overflow-y-auto flex flex-col justify-between border-l border-gray-200 animate-in slide-in-from-right duration-200"
            >
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                  <h3 className="font-bold text-gray-900 text-base">Employee Details</h3>
                  <button 
                    onClick={() => setSelectedEmployee(null)} 
                    className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mt-5 flex flex-col items-center text-center">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-md ${
                    selectedEmployee.reportsTo === null ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-purple-500 to-indigo-600'
                  }`}>
                    {selectedEmployee.reportsTo === null ? <Crown size={28} /> : getInitials(selectedEmployee.name)}
                  </div>
                  <h2 className="mt-3 text-lg font-bold text-gray-900">{selectedEmployee.name}</h2>
                  <p className="text-xs text-purple-600 font-semibold">{selectedEmployee.designation}</p>
                  <span className="mt-1.5 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-semibold border border-purple-100">
                    {selectedEmployee.department}
                  </span>
                </div>

                <div className="mt-5 space-y-2.5">
                  <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                    <User className="text-gray-400" size={16} />
                    <div>
                      <p className="text-[9px] text-gray-400 font-medium uppercase">Employee Code</p>
                      <p className="text-xs font-semibold text-gray-800">{selectedEmployee.code}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                    <Mail className="text-gray-400" size={16} />
                    <div>
                      <p className="text-[9px] text-gray-400 font-medium uppercase">Email Address</p>
                      <p className="text-xs font-semibold text-gray-800">{selectedEmployee.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                    <Phone className="text-gray-400" size={16} />
                    <div>
                      <p className="text-[9px] text-gray-400 font-medium uppercase">Phone Number</p>
                      <p className="text-xs font-semibold text-gray-800">{selectedEmployee.phone}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                    <MapPin className="text-gray-400" size={16} />
                    <div>
                      <p className="text-[9px] text-gray-400 font-medium uppercase">Location</p>
                      <p className="text-xs font-semibold text-gray-800">{selectedEmployee.location}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                    <Calendar className="text-gray-400" size={16} />
                    <div>
                      <p className="text-[9px] text-gray-400 font-medium uppercase">Joining Date</p>
                      <p className="text-xs font-semibold text-gray-800">{selectedEmployee.joinedDate}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 space-y-2 border-t border-gray-100 mt-4">
                <button 
                  onClick={() => handleOpenFullProfile(selectedEmployee)} 
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <span>View Full Profile</span>
                  <ExternalLink size={14} />
                </button>

                <button 
                  onClick={() => setSelectedEmployee(null)} 
                  className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-medium transition-colors"
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- FULL PROFILE PAGE OVERLAY --- */}
        {fullProfileEmployee && (
          <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[10000] overflow-y-auto p-4 md:p-8 flex justify-center items-start">
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-gray-100 my-auto animate-in fade-in zoom-in-95 duration-200">
              
              <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-900 text-white p-6 relative">
                <button
                  onClick={() => setFullProfileEmployee(null)}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-semibold backdrop-blur-md transition-colors mb-4"
                >
                  <ArrowLeft size={14} />
                  <span>Back to Org Hierarchy</span>
                </button>

                <div className="flex flex-col md:flex-row items-center md:items-start gap-5">
                  <div className="w-20 h-20 rounded-2xl bg-white text-purple-700 flex items-center justify-center font-bold text-2xl shadow-xl shrink-0">
                    {fullProfileEmployee.reportsTo === null ? <Crown size={32} className="text-amber-500" /> : getInitials(fullProfileEmployee.name)}
                  </div>

                  <div className="text-center md:text-left flex-1">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                      <h1 className="text-xl md:text-2xl font-extrabold">{fullProfileEmployee.name}</h1>
                      <span className="px-2 py-0.5 bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 text-[10px] font-bold rounded-full flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        {fullProfileEmployee.status}
                      </span>
                    </div>
                    <p className="text-purple-200 text-xs font-medium mt-0.5">{fullProfileEmployee.designation}</p>

                    <div className="mt-3 flex flex-wrap items-center justify-center md:justify-start gap-2">
                      <span className="px-2.5 py-0.5 bg-white/10 text-white text-[11px] rounded-lg font-medium border border-white/10">
                        {fullProfileEmployee.department}
                      </span>
                      <span className="px-2.5 py-0.5 bg-white/10 text-white text-[11px] rounded-lg font-medium border border-white/10">
                        Code: {fullProfileEmployee.code}
                      </span>
                      <span className="px-2.5 py-0.5 bg-white/10 text-white text-[11px] rounded-lg font-medium border border-white/10">
                        Type: {fullProfileEmployee.type}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Briefcase size={14} className="text-purple-600" />
                    <span>Organization Info</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Reports To</p>
                      <p className="text-xs font-bold text-gray-900 mt-0.5">{fullProfileEmployee.reportsTo || 'N/A'}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Direct Reports Count</p>
                      <p className="text-xs font-bold text-purple-700 mt-0.5">{fullProfileEmployee.directReportsCount} Team Members</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Joining Date</p>
                      <p className="text-xs font-bold text-gray-900 mt-0.5">{fullProfileEmployee.joinedDate}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Mail size={14} className="text-purple-600" />
                    <span>Contact Information</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Email Address</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">{fullProfileEmployee.email}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Phone Number</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">{fullProfileEmployee.phone}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Work Location</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">{fullProfileEmployee.location}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ShieldCheck size={14} className="text-purple-600" />
                    <span>Personal Details</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Date of Birth</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">{fullProfileEmployee.dob}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Gender</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">{fullProfileEmployee.gender}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium">Marital Status</p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">{fullProfileEmployee.maritalStatus}</p>
                    </div>
                  </div>
                </div>

              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setFullProfileEmployee(null)}
                  className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  Close Profile Page
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}