create type requirement_status as enum ('draft','published','paused','closed','filled');
create table tuition_requirements (
 id uuid primary key default gen_random_uuid(), parent_id uuid not null references parent_profiles, student_id uuid not null,
 class smallint not null check(class between 1 and 12), board_id uuid not null references boards, locality_id uuid not null references localities,
 target_tutor_id uuid references tutor_profiles, mode text not null check(mode in ('open','direct')),
 status requirement_status not null default 'draft', budget integer not null check(budget > 0), unit fee_unit not null,
 days smallint[] not null check(days <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(days)>0), schedule text not null,
 teaching_place teaching_place not null, details text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(student_id,parent_id) references student_profiles(id,parent_id), check(mode='direct' or target_tutor_id is null)
);
create index requirement_discovery on tuition_requirements(locality_id,class,board_id,teaching_place,created_at desc) where status='published' and mode='open';
create index requirements_owner on tuition_requirements(parent_id,created_at desc);
create table requirement_subjects (requirement_id uuid references tuition_requirements on delete cascade, subject_id uuid references subjects, primary key(requirement_id,subject_id));
create table saved_tutors (parent_id uuid references parent_profiles, tutor_id uuid references tutor_profiles, created_at timestamptz not null default now(), primary key(parent_id,tutor_id));
insert into cities(name) values ('Balasore');
insert into localities(city_id,name) select id,locality from cities cross join unnest(array['Sahadevkhunta','Motiganj','Proof Road','Sunhat','Remuna','Station Square','Kuruda','Fakir Mohan Golai']) as locality where cities.name='Balasore';
insert into boards(name) values ('CBSE'),('CHSE Odisha'),('BSE Odisha'),('ICSE'),('ISC');
insert into subjects(name) values ('Mathematics'),('English'),('Science'),('Odia'),('Social Science'),('Hindi'),('Physics'),('Chemistry'),('Biology'),('Computer Science'),(' Accountancy');
update subjects set name=trim(name);
