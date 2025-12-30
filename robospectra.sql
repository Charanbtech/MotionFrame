--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-12-30 23:20:51

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 217 (class 1259 OID 183831)
-- Name: annotations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.annotations (
    id integer NOT NULL,
    image_id integer,
    class_name character varying,
    annotation_type character varying,
    coordinates text,
    created_at timestamp without time zone
);


ALTER TABLE public.annotations OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 183836)
-- Name: annotations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.annotations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.annotations_id_seq OWNER TO postgres;

--
-- TOC entry 4934 (class 0 OID 0)
-- Dependencies: 218
-- Name: annotations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.annotations_id_seq OWNED BY public.annotations.id;


--
-- TOC entry 219 (class 1259 OID 183837)
-- Name: project_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_images (
    id integer NOT NULL,
    project_id integer,
    filename character varying,
    filepath character varying,
    is_video_frame boolean,
    frame_number integer,
    width integer,
    height integer,
    uploaded_at timestamp without time zone
);


ALTER TABLE public.project_images OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 183842)
-- Name: project_images_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.project_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_images_id_seq OWNER TO postgres;

--
-- TOC entry 4935 (class 0 OID 0)
-- Dependencies: 220
-- Name: project_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.project_images_id_seq OWNED BY public.project_images.id;


--
-- TOC entry 221 (class 1259 OID 183843)
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    name character varying,
    project_type character varying,
    description text,
    classes text,
    created_at timestamp without time zone,
    coco_json text,
    class_colors text
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 183848)
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projects_id_seq OWNER TO postgres;

--
-- TOC entry 4936 (class 0 OID 0)
-- Dependencies: 222
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- TOC entry 223 (class 1259 OID 183849)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying NOT NULL,
    email character varying NOT NULL,
    username character varying NOT NULL,
    hashed_password character varying NOT NULL,
    created_at timestamp without time zone
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 183854)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- TOC entry 4937 (class 0 OID 0)
-- Dependencies: 224
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 4757 (class 2604 OID 183855)
-- Name: annotations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.annotations ALTER COLUMN id SET DEFAULT nextval('public.annotations_id_seq'::regclass);


--
-- TOC entry 4758 (class 2604 OID 183856)
-- Name: project_images id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_images ALTER COLUMN id SET DEFAULT nextval('public.project_images_id_seq'::regclass);


--
-- TOC entry 4759 (class 2604 OID 183857)
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- TOC entry 4760 (class 2604 OID 183858)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 4921 (class 0 OID 183831)
-- Dependencies: 217
-- Data for Name: annotations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.annotations (id, image_id, class_name, annotation_type, coordinates, created_at) FROM stdin;
109	27	car	bbox	{"x": 110.96491228070178, "y": 123.01974353455664, "width": 1041.6666666666665, "height": 521.9298245614035}	2025-11-21 08:58:39.600969
123	28	heading	bbox	{"x": 590.2315698198803, "y": 410.0522794033194, "width": 1316.846002281382, "height": 263.3692004562764}	2025-11-21 09:29:57.039589
125	28	table	bbox	{"x": 436.6653906562723, "y": 2437.744226942939, "width": 1620.3269496994685, "height": 723.4487298352365}	2025-11-21 09:30:25.079771
129	29	sign	bbox	{"x": 1750.6941950927587, "y": 1154.8335042938652, "width": 650.6104129263915, "height": 328.8031119090365}	2025-11-21 09:33:12.08064
131	28	serial no	bbox	{"x": 1205.0209455415918, "y": 133.44511410834764, "width": 160.9036505086774, "height": 118.92878515858766}	2025-11-21 09:34:20.276238
132	29	heading	bbox	{"x": 253.21179044074546, "y": 469.8570073955617, "width": 277.9109023780904, "height": 97.1013996260798}	2025-11-21 09:36:47.400831
133	29	heading	bbox	{"x": 932.9215878233038, "y": 1099.3419429025616, "width": 602.6983425067019, "height": 113.8430202512659}	2025-11-21 09:36:51.620437
108	27	dog	bbox	{"x": 650.438596491228, "y": 375.212725990697, "width": 184.21052631578937, "height": 414.47368421052624}	2025-11-21 08:58:29.301568
\.


--
-- TOC entry 4923 (class 0 OID 183837)
-- Dependencies: 219
-- Data for Name: project_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.project_images (id, project_id, filename, filepath, is_video_frame, frame_number, width, height, uploaded_at) FROM stdin;
27	17	bestcarfordog.webp	project_17\\530dc257-3cd1-476b-909c-ace16d59646d.webp	f	\N	1200	799	2025-11-21 08:58:16.711617
28	18	image (9).png	project_18\\9c542f38-4465-48ae-90f9-b618ab20907f.png	f	\N	2480	3507	2025-11-21 09:00:22.378115
29	18	image (8).png	project_18\\f65d5a2b-fe88-434b-855f-306bc1eb4fb6.png	f	\N	2480	3507	2025-11-21 09:32:25.187458
\.


--
-- TOC entry 4925 (class 0 OID 183843)
-- Dependencies: 221
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.projects (id, name, project_type, description, classes, created_at, coco_json, class_colors) FROM stdin;
19	CAG	segmentation		[]	2025-11-21 11:48:45.881166	\N	\N
18	page	segmentation		["heading", "passage", "table", "sign", "serial no"]	2025-11-21 09:00:15.170452	{\n  "images": [\n    {\n      "id": 0,\n      "file_name": "image (9).png",\n      "width": 2480,\n      "height": 3507\n    },\n    {\n      "id": 1,\n      "file_name": "image (8).png",\n      "width": 2480,\n      "height": 3507\n    }\n  ],\n  "annotations": [\n    {\n      "id": 1,\n      "image_id": 0,\n      "category_id": 0,\n      "category_name": "heading",\n      "supercategory": "object",\n      "bbox": [\n        590.2315698198803,\n        410.0522794033194,\n        1316.846002281382,\n        263.3692004562764\n      ],\n      "area": 346816.67874489154,\n      "iscrowd": 0\n    },\n    {\n      "id": 2,\n      "image_id": 0,\n      "category_id": 1,\n      "category_name": "passage",\n      "supercategory": "object",\n      "bbox": [\n        227.62180107573167,\n        661.970645057149,\n        1918.562848437778,\n        1760.9081970261618\n      ],\n      "area": 3378413.0463239453,\n      "iscrowd": 0\n    },\n    {\n      "id": 3,\n      "image_id": 0,\n      "category_id": 2,\n      "category_name": "table",\n      "supercategory": "object",\n      "bbox": [\n        436.6653906562723,\n        2437.744226942939,\n        1620.3269496994685,\n        723.4487298352365\n      ],\n      "area": 1172223.4736778836,\n      "iscrowd": 0\n    },\n    {\n      "id": 4,\n      "image_id": 0,\n      "category_id": 4,\n      "category_name": "serial no",\n      "supercategory": "object",\n      "bbox": [\n        1205.0209455415918,\n        133.44511410834764,\n        160.9036505086774,\n        118.92878515858766\n      ],\n      "area": 19136.07568257897,\n      "iscrowd": 0\n    },\n    {\n      "id": 5,\n      "image_id": 1,\n      "category_id": 3,\n      "category_name": "sign",\n      "supercategory": "object",\n      "bbox": [\n        1750.6941950927587,\n        1154.8335042938652,\n        650.6104129263915,\n        328.8031119090365\n      ],\n      "area": 213922.72841062074,\n      "iscrowd": 0\n    },\n    {\n      "id": 6,\n      "image_id": 1,\n      "category_id": 0,\n      "category_name": "heading",\n      "supercategory": "object",\n      "bbox": [\n        253.21179044074546,\n        469.8570073955617,\n        277.9109023780904,\n        97.1013996260798\n      ],\n      "area": 26985.537592259403,\n      "iscrowd": 0\n    },\n    {\n      "id": 7,\n      "image_id": 1,\n      "category_id": 0,\n      "category_name": "heading",\n      "supercategory": "object",\n      "bbox": [\n        932.9215878233038,\n        1099.3419429025616,\n        602.6983425067019,\n        113.8430202512659\n      ],\n      "area": 68612.99961139486,\n      "iscrowd": 0\n    }\n  ]\n}	{"passage": "#db3700", "table": "#9d00e0", "sign": "#ffcc00", "serial no": "#1900d6"}
17	cags	segmentation		["dog", "car"]	2025-11-21 08:57:29.764101	{\n  "images": [\n    {\n      "id": 0,\n      "file_name": "bestcarfordog.webp",\n      "width": 1200,\n      "height": 799\n    }\n  ],\n  "annotations": [\n    {\n      "id": 1,\n      "image_id": 0,\n      "category_id": 1,\n      "category_name": "car",\n      "supercategory": "object",\n      "bbox": [\n        110.96491228070178,\n        123.01974353455664,\n        1041.6666666666665,\n        521.9298245614035\n      ],\n      "area": 543676.9005847953,\n      "iscrowd": 0\n    },\n    {\n      "id": 2,\n      "image_id": 0,\n      "category_id": 0,\n      "category_name": "dog",\n      "supercategory": "object",\n      "bbox": [\n        650.438596491228,\n        375.212725990697,\n        184.21052631578937,\n        414.47368421052624\n      ],\n      "area": 76350.41551246532,\n      "iscrowd": 0\n    }\n  ]\n}	{"dog": "#1100ff", "car": "#b300ff"}
\.


--
-- TOC entry 4927 (class 0 OID 183849)
-- Dependencies: 223
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, username, hashed_password, created_at) FROM stdin;
1	Suresh Kannan	go.teamchai@gmail.com	go.teamchai@gmail.com	$2b$12$ixY0NO.jA66T33DgL6oOaeBV7VyI3/lID83qB/FUe0pOUUV3QEode	2025-11-20 07:32:24.780457
\.


--
-- TOC entry 4938 (class 0 OID 0)
-- Dependencies: 218
-- Name: annotations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.annotations_id_seq', 134, true);


--
-- TOC entry 4939 (class 0 OID 0)
-- Dependencies: 220
-- Name: project_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_images_id_seq', 29, true);


--
-- TOC entry 4940 (class 0 OID 0)
-- Dependencies: 222
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.projects_id_seq', 19, true);


--
-- TOC entry 4941 (class 0 OID 0)
-- Dependencies: 224
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- TOC entry 4762 (class 2606 OID 183860)
-- Name: annotations annotations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.annotations
    ADD CONSTRAINT annotations_pkey PRIMARY KEY (id);


--
-- TOC entry 4766 (class 2606 OID 183862)
-- Name: project_images project_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_images
    ADD CONSTRAINT project_images_pkey PRIMARY KEY (id);


--
-- TOC entry 4770 (class 2606 OID 183864)
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- TOC entry 4775 (class 2606 OID 183866)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4763 (class 1259 OID 183867)
-- Name: ix_annotations_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_annotations_id ON public.annotations USING btree (id);


--
-- TOC entry 4764 (class 1259 OID 183868)
-- Name: ix_project_images_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_project_images_id ON public.project_images USING btree (id);


--
-- TOC entry 4767 (class 1259 OID 183869)
-- Name: ix_projects_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_projects_id ON public.projects USING btree (id);


--
-- TOC entry 4768 (class 1259 OID 183870)
-- Name: ix_projects_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_projects_name ON public.projects USING btree (name);


--
-- TOC entry 4771 (class 1259 OID 183871)
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- TOC entry 4772 (class 1259 OID 183872)
-- Name: ix_users_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_users_id ON public.users USING btree (id);


--
-- TOC entry 4773 (class 1259 OID 183873)
-- Name: ix_users_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username);


-- Completed on 2025-12-30 23:20:51

--
-- PostgreSQL database dump complete
--

