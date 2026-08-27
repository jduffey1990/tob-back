// Template prayer seed data — generated from the iOS bundled list
// (TowerOfBabble/Features/Prayers/DefaultPrayers.swift). The templateKey slugs
// are hardcoded identically on both sides; they are the stable identity that
// keeps prayer row UUIDs (and therefore S3 audio keys) fixed across re-seeds.

export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

export const TEMPLATE_DEFAULT_VOICE_ID = 'com.apple.voice.compact.en-US.Samantha';

export interface TemplateSeed {
  templateKey: string;
  title: string;
  text: string;
  category: string;
}

export const TEMPLATES: TemplateSeed[] = [
  // Christian Traditional (10)
  {
    templateKey: "the-lords-prayer",
    title: "The Lord's Prayer",
    text: "Our Father, who art in heaven, hallowed be thy name. Thy kingdom come, thy will be done, on earth as it is in heaven. Give us this day our daily bread, and forgive us our trespasses, as we forgive those who trespass against us. And lead us not into temptation, but deliver us from evil. Amen.",
    category: "Christian Traditional",
  },
  {
    templateKey: "serenity-prayer",
    title: "Serenity Prayer",
    text: "God, grant me the serenity to accept the things I cannot change, courage to change the things I can, and wisdom to know the difference.",
    category: "Christian Traditional",
  },
  {
    templateKey: "prayer-of-st-francis",
    title: "Prayer of St. Francis",
    text: "Lord, make me an instrument of your peace. Where there is hatred, let me sow love; where there is injury, pardon; where there is doubt, faith; where there is despair, hope; where there is darkness, light; and where there is sadness, joy.",
    category: "Christian Traditional",
  },
  {
    templateKey: "doxology",
    title: "Doxology",
    text: "Praise God, from whom all blessings flow; Praise Him, all creatures here below; Praise Him above, ye heavenly host; Praise Father, Son, and Holy Ghost. Amen.",
    category: "Christian Traditional",
  },
  {
    templateKey: "the-jesus-prayer",
    title: "The Jesus Prayer",
    text: "Lord Jesus Christ, Son of God, have mercy on me, a sinner.",
    category: "Christian Traditional",
  },
  {
    templateKey: "gloria-patri",
    title: "Gloria Patri",
    text: "Glory be to the Father, and to the Son, and to the Holy Spirit. As it was in the beginning, is now, and ever shall be, world without end. Amen.",
    category: "Christian Traditional",
  },
  {
    templateKey: "apostles-creed-prayer",
    title: "Apostles' Creed Prayer",
    text: "I believe in God, the Father almighty, creator of heaven and earth. I believe in Jesus Christ, his only Son, our Lord. He was conceived by the power of the Holy Spirit and born of the Virgin Mary. He suffered under Pontius Pilate, was crucified, died, and was buried. He descended to the dead. On the third day he rose again. He ascended into heaven, and is seated at the right hand of the Father. He will come again to judge the living and the dead. I believe in the Holy Spirit, the holy catholic Church, the communion of saints, the forgiveness of sins, the resurrection of the body, and the life everlasting. Amen.",
    category: "Christian Traditional",
  },
  {
    templateKey: "prayer-of-jabez",
    title: "Prayer of Jabez",
    text: "Oh, that You would bless me indeed, and enlarge my territory, that Your hand would be with me, and that You would keep me from evil, that I may not cause pain. Amen.",
    category: "Christian Traditional",
  },
  {
    templateKey: "st-patricks-breastplate",
    title: "St. Patrick's Breastplate",
    text: "Christ be with me, Christ within me, Christ behind me, Christ before me, Christ beside me, Christ to win me, Christ to comfort and restore me. Christ beneath me, Christ above me, Christ in quiet, Christ in danger, Christ in hearts of all that love me, Christ in mouth of friend and stranger.",
    category: "Christian Traditional",
  },
  {
    templateKey: "prayer-of-humble-access",
    title: "Prayer of Humble Access",
    text: "We do not presume to come to this thy table, O merciful Lord, trusting in our own righteousness, but in thy manifold and great mercies. We are not worthy so much as to gather up the crumbs under thy table. But thou art the same Lord whose property is always to have mercy. Grant us therefore, gracious Lord, so to eat the flesh of thy dear Son Jesus Christ, and to drink his blood, that we may evermore dwell in him, and he in us. Amen.",
    category: "Christian Traditional",
  },
  // Catholic (12)
  {
    templateKey: "hail-mary",
    title: "Hail Mary",
    text: "Hail Mary, full of grace, the Lord is with thee. Blessed art thou among women, and blessed is the fruit of thy womb, Jesus. Holy Mary, Mother of God, pray for us sinners, now and at the hour of our death. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "guardian-angel-prayer",
    title: "Guardian Angel Prayer",
    text: "Angel of God, my guardian dear, to whom God's love commits me here, ever this day be at my side, to light and guard, to rule and guide. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "the-rosary-apostles-creed",
    title: "The Rosary - Apostles' Creed",
    text: "I believe in God, the Father Almighty, Creator of Heaven and earth; and in Jesus Christ, His only Son Our Lord, Who was conceived by the Holy Spirit, born of the Virgin Mary, suffered under Pontius Pilate, was crucified, died, and was buried. He descended into Hell; the third day He rose again from the dead; He ascended into Heaven, and sitteth at the right hand of God, the Father almighty; from thence He shall come to judge the living and the dead. I believe in the Holy Spirit, the holy Catholic Church, the communion of saints, the forgiveness of sins, the resurrection of the body and life everlasting. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "act-of-contrition",
    title: "Act of Contrition",
    text: "O my God, I am heartily sorry for having offended Thee, and I detest all my sins because of Thy just punishments, but most of all because they offend Thee, my God, Who art all-good and deserving of all my love. I firmly resolve, with the help of Thy grace, to sin no more and to avoid the near occasions of sin. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "memorare",
    title: "Memorare",
    text: "Remember, O most gracious Virgin Mary, that never was it known that anyone who fled to thy protection, implored thy help, or sought thy intercession was left unaided. Inspired with this confidence, I fly to thee, O Virgin of virgins, my Mother; to thee do I come; before thee I stand, sinful and sorrowful. O Mother of the Word Incarnate, despise not my petitions, but in thy mercy hear and answer me. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "prayer-to-st-michael-the-archangel",
    title: "Prayer to St. Michael the Archangel",
    text: "St. Michael the Archangel, defend us in battle. Be our protection against the wickedness and snares of the devil. May God rebuke him, we humbly pray; and do thou, O Prince of the Heavenly Host, by the power of God, cast into hell Satan and all the evil spirits who prowl about the world seeking the ruin of souls. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "angelus",
    title: "Angelus",
    text: "The Angel of the Lord declared unto Mary, and she conceived of the Holy Spirit. Hail Mary, full of grace, the Lord is with thee; blessed art thou among women, and blessed is the fruit of thy womb, Jesus. Holy Mary, Mother of God, pray for us sinners, now and at the hour of our death. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "prayer-before-meals-catholic",
    title: "Prayer Before Meals (Catholic)",
    text: "Bless us, O Lord, and these Thy gifts, which we are about to receive from Thy bounty, through Christ our Lord. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "hail-holy-queen",
    title: "Hail Holy Queen",
    text: "Hail, holy Queen, Mother of mercy, our life, our sweetness and our hope. To thee do we cry, poor banished children of Eve: to thee do we send up our sighs, mourning and weeping in this vale of tears. Turn then, most gracious Advocate, thine eyes of mercy toward us, and after this our exile, show unto us the blessed fruit of thy womb, Jesus. O clement, O loving, O sweet Virgin Mary! Pray for us, O Holy Mother of God, that we may be made worthy of the promises of Christ. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "prayer-to-the-sacred-heart-of-jesus",
    title: "Prayer to the Sacred Heart of Jesus",
    text: "O most holy Heart of Jesus, fountain of every blessing, I adore You, I love You, and with lively sorrow for my sins I offer You this poor heart of mine. Make me humble, patient, pure and wholly obedient to Your will. Grant, Good Jesus, that I may live in You and for You. Protect me in the midst of danger. Comfort me in my afflictions. Give me health of body, assistance in my temporal needs, Your blessing on all that I do, and the grace of a holy death. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "fatima-prayer",
    title: "Fatima Prayer",
    text: "O my Jesus, forgive us our sins, save us from the fires of hell, and lead all souls to Heaven, especially those in most need of Thy mercy. Amen.",
    category: "Catholic",
  },
  {
    templateKey: "prayer-to-st-joseph",
    title: "Prayer to St. Joseph",
    text: "O St. Joseph, whose protection is so great, so strong, so prompt before the throne of God, I place in you all my interests and desires. O St. Joseph, do assist me by your powerful intercession, and obtain for me from your divine Son all spiritual blessings, through Jesus Christ, our Lord. So that, having engaged here below your heavenly power, I may offer my thanksgiving and homage to the most loving of Fathers. Amen.",
    category: "Catholic",
  },
  // Morning (10)
  {
    templateKey: "morning-prayer",
    title: "Morning Prayer",
    text: "Dear Lord, as I begin this new day, I ask for Your guidance and strength. Help me to face whatever comes with grace and courage. May my actions reflect Your love today. Amen.",
    category: "Morning",
  },
  {
    templateKey: "morning-offering",
    title: "Morning Offering",
    text: "O Jesus, through the Immaculate Heart of Mary, I offer You my prayers, works, joys, and sufferings of this day for all the intentions of Your Sacred Heart. Amen.",
    category: "Morning",
  },
  {
    templateKey: "new-day-gratitude",
    title: "New Day Gratitude",
    text: "Thank You, Lord, for the gift of this new day. Thank You for rest, for breath, for life. Guide my steps and guard my heart as I walk through whatever this day holds. Amen.",
    category: "Morning",
  },
  {
    templateKey: "morning-strength-prayer",
    title: "Morning Strength Prayer",
    text: "Father in Heaven, as the sun rises, fill me with Your light. Grant me strength for today's challenges, wisdom for today's decisions, and grace for today's relationships. Let me walk worthy of the calling You have placed on my life. Amen.",
    category: "Morning",
  },
  {
    templateKey: "fresh-start-prayer",
    title: "Fresh Start Prayer",
    text: "Lord, Your mercies are new every morning. I claim Your promise of a fresh start today. Wash away yesterday's failures and fears. Fill me with hope and purpose for the hours ahead. Amen.",
    category: "Morning",
  },
  {
    templateKey: "morning-protection",
    title: "Morning Protection",
    text: "Heavenly Father, cover me with Your protection today. Shield my mind from negative thoughts, guard my heart from bitterness, and protect my path from harm. Let Your angels encamp around me. Amen.",
    category: "Morning",
  },
  {
    templateKey: "morning-purpose-prayer",
    title: "Morning Purpose Prayer",
    text: "God, show me my purpose today. Help me see the opportunities to serve, the moments to encourage, and the chances to make a difference. Use me as Your instrument. Amen.",
    category: "Morning",
  },
  {
    templateKey: "morning-peace",
    title: "Morning Peace",
    text: "Prince of Peace, quiet my anxious thoughts this morning. Replace worry with trust, fear with faith, and stress with supernatural peace. Help me remember that You are in control. Amen.",
    category: "Morning",
  },
  {
    templateKey: "morning-dedication",
    title: "Morning Dedication",
    text: "Lord, I dedicate this day to You. Every conversation, every task, every moment - may it all bring glory to Your name. Work through me today for Your purposes. Amen.",
    category: "Morning",
  },
  {
    templateKey: "awakening-prayer",
    title: "Awakening Prayer",
    text: "Lord, as I awaken to this new day, awaken in me a fresh awareness of Your presence. Open my eyes to see You at work, my ears to hear Your voice, and my heart to follow Your leading. Amen.",
    category: "Morning",
  },
  // Evening (10)
  {
    templateKey: "evening-prayer",
    title: "Evening Prayer",
    text: "Gracious God, as this day comes to a close, I thank You for Your blessings and guidance. Forgive me where I have fallen short, and grant me peaceful rest tonight. Amen.",
    category: "Evening",
  },
  {
    templateKey: "night-prayer",
    title: "Night Prayer",
    text: "Lord, as darkness falls, be my light. As I lay down to rest, be my peace. Watch over me and those I love through the night. May I wake refreshed and ready to serve You tomorrow. Amen.",
    category: "Evening",
  },
  {
    templateKey: "evening-reflection",
    title: "Evening Reflection",
    text: "Father, I bring this day before You - the good and the difficult. Thank You for Your faithfulness through it all. Teach me from today's experiences and prepare me for tomorrow. Amen.",
    category: "Evening",
  },
  {
    templateKey: "bedtime-prayer",
    title: "Bedtime Prayer",
    text: "Now I lay me down to sleep, I pray the Lord my soul to keep. Guard me through the silent night, and wake me with the morning light. Amen.",
    category: "Evening",
  },
  {
    templateKey: "evening-gratitude",
    title: "Evening Gratitude",
    text: "Thank You, God, for this day - for laughter shared, work completed, challenges overcome, and love given and received. I rest tonight in Your goodness. Amen.",
    category: "Evening",
  },
  {
    templateKey: "evening-release",
    title: "Evening Release",
    text: "Lord, I release to You all the burdens I've carried today. The worries, the failures, the what-ifs - I leave them at Your feet. Let me rest in the knowledge that You are handling what I cannot. Amen.",
    category: "Evening",
  },
  {
    templateKey: "night-protection",
    title: "Night Protection",
    text: "Almighty God, station Your angels around my home tonight. Protect my family from all harm - physical, emotional, and spiritual. Let us rest under the shadow of Your wings. Amen.",
    category: "Evening",
  },
  {
    templateKey: "evening-forgiveness",
    title: "Evening Forgiveness",
    text: "Father, forgive me for my shortcomings today - the words left unsaid, the kindness withheld, the patience lost. Cleanse my heart and help me do better tomorrow. Amen.",
    category: "Evening",
  },
  {
    templateKey: "peaceful-sleep-prayer",
    title: "Peaceful Sleep Prayer",
    text: "God of peace, calm my racing mind and still my restless heart. Banish anxiety and fear from my bedroom. Fill this space with Your presence and grant me deep, restorative sleep. Amen.",
    category: "Evening",
  },
  {
    templateKey: "days-end-prayer",
    title: "Day's End Prayer",
    text: "As this day ends, Lord, I acknowledge that every breath was a gift from You. Thank You for sustaining me. I trust You with the night ahead and the dawn that follows. Amen.",
    category: "Evening",
  },
  // Meals (8)
  {
    templateKey: "grace-before-meals",
    title: "Grace Before Meals",
    text: "Bless us, O Lord, and these thy gifts which we are about to receive from thy bounty. Through Christ our Lord. Amen.",
    category: "Meals",
  },
  {
    templateKey: "simple-table-blessing",
    title: "Simple Table Blessing",
    text: "God is great, God is good, let us thank Him for our food. By His hands we all are fed, give us Lord our daily bread. Amen.",
    category: "Meals",
  },
  {
    templateKey: "family-meal-prayer",
    title: "Family Meal Prayer",
    text: "Heavenly Father, thank You for this food and for the hands that prepared it. Bless our time together around this table. May this meal nourish our bodies and our conversation nourish our relationships. Amen.",
    category: "Meals",
  },
  {
    templateKey: "gratitude-for-provision",
    title: "Gratitude for Provision",
    text: "Provider God, we acknowledge that every good gift comes from You. Thank You for this meal and for Your faithful provision in our lives. Help us remember those who hunger. Amen.",
    category: "Meals",
  },
  {
    templateKey: "breakfast-blessing",
    title: "Breakfast Blessing",
    text: "Good morning, Lord! Thank You for this food to fuel our day. Bless those who planted, harvested, and prepared it. May we use the strength this meal provides to serve You and others. Amen.",
    category: "Meals",
  },
  {
    templateKey: "evening-meal-prayer",
    title: "Evening Meal Prayer",
    text: "Lord, as we gather for this evening meal, we thank You for bringing us safely through this day. Bless this food and the fellowship we share. Amen.",
    category: "Meals",
  },
  {
    templateKey: "thanksgiving-table-prayer",
    title: "Thanksgiving Table Prayer",
    text: "Gracious God, we gather with grateful hearts for this abundant feast. Thank You for Your provision, for loved ones gathered here, and for the blessings we often take for granted. May we always remember Your goodness. Amen.",
    category: "Meals",
  },
  {
    templateKey: "childrens-meal-prayer",
    title: "Children's Meal Prayer",
    text: "Thank You for the world so sweet, thank You for the food we eat, thank You for the birds that sing, thank You God for everything. Amen.",
    category: "Meals",
  },
  // Healing (10)
  {
    templateKey: "prayer-for-healing",
    title: "Prayer for Healing",
    text: "Great Physician, I bring before You my pain and need for healing. Touch my body, mind, and spirit with Your restorative power. Grant wisdom to those caring for me, and give me patience in the process. Amen.",
    category: "Healing",
  },
  {
    templateKey: "comfort-in-grief",
    title: "Comfort in Grief",
    text: "God of all comfort, my heart is broken and my tears flow freely. Hold me close in this dark valley. Be near to me in my mourning and remind me that You understand sorrow. Amen.",
    category: "Healing",
  },
  {
    templateKey: "prayer-in-pain",
    title: "Prayer in Pain",
    text: "Lord Jesus, You knew physical suffering. You understand my pain. I ask for relief, but even more, I ask for Your presence with me in this trial. Strengthen my spirit when my body is weak. Amen.",
    category: "Healing",
  },
  {
    templateKey: "emotional-healing-prayer",
    title: "Emotional Healing Prayer",
    text: "Healer of Hearts, bind up the wounds in my soul. Heal the hurts that others cannot see. Restore my joy, renew my hope, and rebuild my broken spirit. Make me whole again. Amen.",
    category: "Healing",
  },
  {
    templateKey: "prayer-for-the-sick",
    title: "Prayer for the Sick",
    text: "Merciful Father, I lift up those who are ill. Touch them with Your healing hand. Ease their pain, calm their fears, and restore their health according to Your will. Amen.",
    category: "Healing",
  },
  {
    templateKey: "peace-in-suffering",
    title: "Peace in Suffering",
    text: "God, I don't understand why I'm going through this, but I choose to trust You. Give me peace that transcends my circumstances. Help me find meaning and purpose even in suffering. Amen.",
    category: "Healing",
  },
  {
    templateKey: "prayer-for-mental-health",
    title: "Prayer for Mental Health",
    text: "Lord, You created my mind and You understand its complexities. Bring healing to my mental and emotional struggles. Guide me to the help I need and give me courage to seek it. Amen.",
    category: "Healing",
  },
  {
    templateKey: "recovery-prayer",
    title: "Recovery Prayer",
    text: "Father, I'm on the road to recovery. Give me patience with the process and discipline to follow through. Strengthen my body day by day. Thank You for progress already made. Amen.",
    category: "Healing",
  },
  {
    templateKey: "broken-heart-prayer",
    title: "Broken Heart Prayer",
    text: "Lord, You are close to the brokenhearted. I need You near today. My heart aches with loss. Comfort me with Your presence and heal me with Your love. Amen.",
    category: "Healing",
  },
  {
    templateKey: "chronic-illness-prayer",
    title: "Chronic Illness Prayer",
    text: "God, this condition is my constant companion. Help me not let it define me or defeat me. Give me strength for each day, hope for tomorrow, and joy despite the struggle. Amen.",
    category: "Healing",
  },
  // Guidance (8)
  {
    templateKey: "prayer-for-wisdom",
    title: "Prayer for Wisdom",
    text: "God of all wisdom, I face decisions that are beyond my understanding. Grant me discernment to know the right path. Speak clearly to my heart and give me courage to follow Your leading. Amen.",
    category: "Guidance",
  },
  {
    templateKey: "direction-in-confusion",
    title: "Direction in Confusion",
    text: "Lord, I'm at a crossroads and don't know which way to turn. Clear the fog of confusion. Show me Your path with unmistakable clarity. I trust Your plans are better than mine. Amen.",
    category: "Guidance",
  },
  {
    templateKey: "career-guidance",
    title: "Career Guidance",
    text: "Father, guide my professional life. Show me where You want me to work and how You want me to serve. Give me wisdom in job decisions and help me honor You in my workplace. Amen.",
    category: "Guidance",
  },
  {
    templateKey: "life-decisions-prayer",
    title: "Life Decisions Prayer",
    text: "God, the choices before me feel overwhelming. Grant me Your wisdom. Help me weigh options carefully, seek godly counsel, and ultimately follow where You lead, even if it's uncomfortable. Amen.",
    category: "Guidance",
  },
  {
    templateKey: "prayer-for-discernment",
    title: "Prayer for Discernment",
    text: "Holy Spirit, sharpen my spiritual discernment. Help me distinguish between my desires and Your will, between good options and God options. Align my heart with Yours. Amen.",
    category: "Guidance",
  },
  {
    templateKey: "students-prayer",
    title: "Student's Prayer",
    text: "Lord, grant me focus as I study, clarity as I learn, and wisdom as I apply knowledge. Help me work diligently while trusting that my worth isn't measured by grades alone. Amen.",
    category: "Guidance",
  },
  {
    templateKey: "life-purpose-prayer",
    title: "Life Purpose Prayer",
    text: "Creator God, reveal to me the purpose for which You created me. What unique contribution am I meant to make? How can I use my gifts for Your glory? Show me my calling. Amen.",
    category: "Guidance",
  },
  {
    templateKey: "waiting-on-god",
    title: "Waiting on God",
    text: "Lord, teach me to wait patiently for Your timing. In this season of uncertainty, help me trust that Your delays are not denials. Strengthen my faith while I wait for Your answer. Amen.",
    category: "Guidance",
  },
  // Strength (8)
  {
    templateKey: "prayer-for-strength",
    title: "Prayer for Strength",
    text: "Almighty God, I am weak but You are strong. Renew my strength like the eagle. When I am weary, be my energy. When I am afraid, be my courage. Let Your power work through my weakness. Amen.",
    category: "Strength",
  },
  {
    templateKey: "courage-in-fear",
    title: "Courage in Fear",
    text: "Lord, fear grips my heart. Remind me that You have not given me a spirit of fear, but of power, love, and a sound mind. Replace my anxiety with courageous faith. Amen.",
    category: "Strength",
  },
  {
    templateKey: "facing-the-storm",
    title: "Facing the Storm",
    text: "God, the storms of life are raging around me. Be my anchor in the chaos. Give me strength to stand firm. Remind me that You calm the wind and waves with a word. Amen.",
    category: "Strength",
  },
  {
    templateKey: "battle-prayer",
    title: "Battle Prayer",
    text: "Lord, I face battles today - spiritual, emotional, or physical. Clothe me in Your armor. Fight for me when I cannot fight for myself. Give me victory through Your power. Amen.",
    category: "Strength",
  },
  {
    templateKey: "overcoming-obstacles",
    title: "Overcoming Obstacles",
    text: "Father, the mountains before me seem impossible to climb. Remind me that with You, nothing is impossible. Give me strength for this journey and faith to keep moving forward. Amen.",
    category: "Strength",
  },
  {
    templateKey: "daily-endurance",
    title: "Daily Endurance",
    text: "Lord, grant me endurance for the long haul. This isn't a sprint but a marathon. Give me staying power, persistent faith, and the determination to finish well. Amen.",
    category: "Strength",
  },
  {
    templateKey: "warriors-prayer",
    title: "Warrior's Prayer",
    text: "God, make me a spiritual warrior. Give me courage to stand for truth, strength to resist temptation, and boldness to live out my faith. I am on Your side; help me fight the good fight. Amen.",
    category: "Strength",
  },
  {
    templateKey: "perseverance-prayer",
    title: "Perseverance Prayer",
    text: "Lord, when I want to quit, remind me why I started. When I'm exhausted, be my strength. When I'm discouraged, be my hope. Help me persevere through this challenge. Amen.",
    category: "Strength",
  },
  // Gratitude (8)
  {
    templateKey: "simple-gratitude",
    title: "Simple Gratitude",
    text: "Thank You, God, for this moment, this breath, this life. Thank You for blessings seen and unseen. Help me cultivate a grateful heart in all circumstances. Amen.",
    category: "Gratitude",
  },
  {
    templateKey: "counting-blessings",
    title: "Counting Blessings",
    text: "Gracious Father, when I count my blessings, I lose track of the number. Thank You for family, friends, health, provision, and most of all, Your unfailing love. Amen.",
    category: "Gratitude",
  },
  {
    templateKey: "grateful-heart-prayer",
    title: "Grateful Heart Prayer",
    text: "Lord, cultivate in me a heart that is quick to notice and give thanks. Let gratitude be my default response to life. Thank You for Your daily mercies. Amen.",
    category: "Gratitude",
  },
  {
    templateKey: "thanksgiving-for-salvation",
    title: "Thanksgiving for Salvation",
    text: "Father, I'm overwhelmed by the gift of salvation. Thank You for sending Jesus. Thank You for grace I don't deserve. Thank You for calling me Your child. Amen.",
    category: "Gratitude",
  },
  {
    templateKey: "thanks-in-all-things",
    title: "Thanks in All Things",
    text: "Lord, You command me to give thanks in all circumstances. Even in trials, I find reasons to be grateful - for Your presence, Your promises, and Your faithfulness. Thank You. Amen.",
    category: "Gratitude",
  },
  {
    templateKey: "daily-provisions-thanks",
    title: "Daily Provisions Thanks",
    text: "Provider God, thank You for meeting my needs today. Thank You for food, shelter, clothing, and so much more. Help me share generously from what You've given me. Amen.",
    category: "Gratitude",
  },
  {
    templateKey: "gratitude-for-creation",
    title: "Gratitude for Creation",
    text: "Creator God, thank You for the beauty of Your creation - sunrises and sunsets, mountains and oceans, stars and seasons. Your handiwork declares Your glory. Amen.",
    category: "Gratitude",
  },
  {
    templateKey: "year-end-gratitude",
    title: "Year-End Gratitude",
    text: "Lord, as this year comes to a close, I look back with gratitude. Thank You for growth through challenges, joy in victories, and Your constant presence through it all. Amen.",
    category: "Gratitude",
  },
  // Family (8)
  {
    templateKey: "prayer-for-family",
    title: "Prayer for Family",
    text: "Heavenly Father, I lift up my family to You. Protect them, guide them, and draw each one closer to You. Strengthen our bonds and help us love each other well. Amen.",
    category: "Family",
  },
  {
    templateKey: "marriage-prayer",
    title: "Marriage Prayer",
    text: "Lord, bless my marriage. Help us love each other with patience, communicate with grace, and honor our commitment through all seasons. Make our union a reflection of Your love. Amen.",
    category: "Family",
  },
  {
    templateKey: "prayer-for-children",
    title: "Prayer for Children",
    text: "Father, I entrust my children to Your care. Guide them, protect them, and help them grow in wisdom and faith. Give me wisdom as I parent and patience when I'm tested. Amen.",
    category: "Family",
  },
  {
    templateKey: "prayer-for-parents",
    title: "Prayer for Parents",
    text: "Lord, bless my parents. Thank You for their sacrifices and love. Grant them health, wisdom, and peace. Help me honor them well in word and deed. Amen.",
    category: "Family",
  },
  {
    templateKey: "friendship-prayer",
    title: "Friendship Prayer",
    text: "God, thank You for the gift of true friendship. Bless my friends and help me be a faithful friend in return. Teach us to encourage, forgive, and support one another. Amen.",
    category: "Family",
  },
  {
    templateKey: "healing-relationships",
    title: "Healing Relationships",
    text: "Lord, I bring before You broken relationships that need healing. Soften hardened hearts, including mine. Give us courage to forgive, humble ourselves, and rebuild trust. Amen.",
    category: "Family",
  },
  {
    templateKey: "single-life-prayer",
    title: "Single Life Prayer",
    text: "Father, in this season of singleness, help me find contentment and purpose. Develop in me the character You desire. Whether this season is short or long, let me use it for Your glory. Amen.",
    category: "Family",
  },
  {
    templateKey: "home-blessing",
    title: "Home Blessing",
    text: "Lord, bless this home. Make it a place of peace, love, and grace. May all who enter feel Your presence. Let our hospitality reflect Your welcoming heart. Amen.",
    category: "Family",
  },
  // Forgiveness (8)
  {
    templateKey: "prayer-for-forgiveness",
    title: "Prayer for Forgiveness",
    text: "Merciful God, I have sinned against You and others. I am truly sorry. Forgive me, cleanse me, and help me turn away from wrong. Create in me a clean heart. Amen.",
    category: "Forgiveness",
  },
  {
    templateKey: "forgiving-others",
    title: "Forgiving Others",
    text: "Lord, someone has hurt me deeply. It's hard to forgive, but You command it and You give the strength. Help me release the bitterness and extend the grace I've received from You. Amen.",
    category: "Forgiveness",
  },
  {
    templateKey: "peace-prayer",
    title: "Peace Prayer",
    text: "Prince of Peace, still the storms within me. Quiet my anxious thoughts. Replace worry with trust, fear with faith. Let Your peace, which surpasses understanding, guard my heart and mind. Amen.",
    category: "Forgiveness",
  },
  {
    templateKey: "letting-go-prayer",
    title: "Letting Go Prayer",
    text: "Father, I'm holding onto hurts, regrets, and resentments that poison my soul. Help me let go. Free me from the burden of unforgiveness and the weight of the past. Amen.",
    category: "Forgiveness",
  },
  {
    templateKey: "inner-peace",
    title: "Inner Peace",
    text: "God, external circumstances are chaotic, but I need internal peace. Center me in Your truth. Anchor me in Your promises. Let me rest in the knowledge that You are in control. Amen.",
    category: "Forgiveness",
  },
  {
    templateKey: "reconciliation-prayer",
    title: "Reconciliation Prayer",
    text: "Lord, restore what has been broken between me and another. Give us both humble hearts, honest communication, and willingness to make peace. Be the bridge between us. Amen.",
    category: "Forgiveness",
  },
  {
    templateKey: "self-forgiveness",
    title: "Self-Forgiveness",
    text: "Gracious God, I struggle to forgive myself. Remind me that if You have forgiven me, I can forgive myself. Help me accept Your grace and move forward without guilt and shame. Amen.",
    category: "Forgiveness",
  },
  {
    templateKey: "world-peace-prayer",
    title: "World Peace Prayer",
    text: "God of all nations, we cry out for peace in our troubled world. Where there is war, bring peace. Where there is hatred, bring love. Use Your people as instruments of reconciliation. Amen.",
    category: "Forgiveness",
  },
  // Celtic/Irish (6)
  {
    templateKey: "irish-blessing",
    title: "Irish Blessing",
    text: "May the road rise up to meet you. May the wind be always at your back. May the sun shine warm upon your face; the rains fall soft upon your fields and until we meet again, may God hold you in the palm of His hand.",
    category: "Celtic/Irish",
  },
  {
    templateKey: "celtic-daily-prayer",
    title: "Celtic Daily Prayer",
    text: "This day God sends me strength to guide me, power to uphold me, wisdom to teach me, eyes to watch over me, ears to hear me, words to speak for me, hands to defend me, path to lie before me, shield to shelter me. Christ be with me, Christ before me, Christ behind me.",
    category: "Celtic/Irish",
  },
  {
    templateKey: "st-brigids-prayer",
    title: "St. Brigid's Prayer",
    text: "I would like the angels of Heaven to be among us. I would like an abundance of peace. I would like full vessels of charity. I would like rich treasures of mercy. I would like cheerfulness to preside over all.",
    category: "Celtic/Irish",
  },
  {
    templateKey: "celtic-night-prayer",
    title: "Celtic Night Prayer",
    text: "May the Light of lights come to my dark heart from thy place. May the Spirit's wisdom come to my heart's tablet from my Savior. Be the sacred Three my fortress, be the sacred Three my aid.",
    category: "Celtic/Irish",
  },
  {
    templateKey: "caim-prayer-circle-of-protection",
    title: "Caim Prayer (Circle of Protection)",
    text: "Circle me, Lord. Keep protection near and danger afar. Circle me, Lord. Keep hope within, keep doubt without. Circle me, Lord. Keep light near and darkness afar. Circle me, Lord. Keep peace within, keep evil out.",
    category: "Celtic/Irish",
  },
  {
    templateKey: "celtic-journey-prayer",
    title: "Celtic Journey Prayer",
    text: "May the blessing of light be on you, light without and light within. May the blessed sunshine shine on you and warm your heart till it glows like a great peat fire, so that strangers may come and warm themselves at it.",
    category: "Celtic/Irish",
  },
];
